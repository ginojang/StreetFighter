/**
 * 넷플레이 시그널링 서버 (제로 의존성 · Node 내장 모듈만).
 *
 * 역할은 딱 하나: 같은 방(room)의 두 피어 사이에서 WebRTC 협상 메시지
 * (offer / answer / ICE candidate)를 "그대로 중계"한다. 게임 상태도, 실시간
 * 입력도 이 서버를 거치지 않는다 — 그건 협상이 끝난 뒤 P2P DataChannel로 직접
 * 오간다. 따라서 이 서버는 게임 로직도, 사용자 데이터도, 비밀도 담지 않는다.
 *
 * npm 설치가 필요 없도록 WebSocket(RFC 6455)을 내장 http/crypto/net 만으로
 * 최소 구현했다. 텍스트 프레임(작은 JSON/SDP)만 다루면 충분하다.
 *
 * 실행:   node signaling/server.js            (기본 PORT=8080)
 *         PORT=9000 node signaling/server.js
 *
 * 접속:   ws://<host>:<port>/?room=<이름>&role=host|guest
 *
 * 배포 주의(공개 저장소): 이 파일에 서버 IP·도메인·경로·TURN 자격증명을 절대
 * 하드코딩하지 말 것. 리버스 프록시(wss) 종단과 TURN 자격증명은 배포 환경에서만
 * 주입한다(README 참고).
 */
'use strict';

const http = require('http');
const crypto = require('crypto');

const PORT = Number(process.env.PORT ?? 8080);
const WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/** room 이름 → { host: socket|null, guest: socket|null } */
const rooms = new Map();

const server = http.createServer((req, res) => {
	// 헬스체크용 단순 응답 (업그레이드가 아닌 평범한 GET)
	res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
	res.end('streetfighter signaling: OK\n');
});

server.on('upgrade', (req, socket) => {
	const key = req.headers['sec-websocket-key'];
	if (!key || (req.headers['upgrade'] || '').toLowerCase() !== 'websocket') {
		socket.destroy();
		return;
	}

	const url = new URL(req.url, 'http://localhost');
	const room = url.searchParams.get('room');
	const role = url.searchParams.get('role');
	if (!room || (role !== 'host' && role !== 'guest')) {
		socket.write(
			'HTTP/1.1 400 Bad Request\r\n\r\nroom 과 role(host|guest)이 필요합니다'
		);
		socket.destroy();
		return;
	}

	// WebSocket 핸드셰이크 응답
	const accept = crypto
		.createHash('sha1')
		.update(key + WS_MAGIC)
		.digest('base64');
	socket.write(
		'HTTP/1.1 101 Switching Protocols\r\n' +
			'Upgrade: websocket\r\n' +
			'Connection: Upgrade\r\n' +
			`Sec-WebSocket-Accept: ${accept}\r\n\r\n`
	);
	socket.setNoDelay(true);

	const slot = rooms.get(room) ?? { host: null, guest: null };
	if (slot[role]) {
		// 같은 역할이 이미 있음 → 거절
		sendFrame(socket, JSON.stringify({ t: 'error', reason: 'role-taken' }));
		socket.end();
		return;
	}
	slot[role] = socket;
	rooms.set(room, slot);
	socket._room = room;
	socket._role = role;
	log(`join room=${room} role=${role}`);

	const peerRole = role === 'host' ? 'guest' : 'host';
	// 양쪽이 다 모이면 둘 다에게 'ready' → 호스트가 offer 생성 시작
	if (slot.host && slot.guest) {
		sendFrame(slot.host, JSON.stringify({ t: 'ready' }));
		sendFrame(slot.guest, JSON.stringify({ t: 'ready' }));
		log(`room=${room} ready (both peers present)`);
	}

	readFrames(socket, {
		onText: (text) => {
			// 상대에게 그대로 중계 (서버는 내용을 해석하지 않음)
			const current = rooms.get(room);
			const peer = current && current[peerRole];
			if (peer) sendFrame(peer, text);
		},
		onClose: () => {
			const current = rooms.get(room);
			if (!current) return;
			if (current[role] === socket) current[role] = null;
			const peer = current[peerRole];
			if (peer) sendFrame(peer, JSON.stringify({ t: 'peer-left' }));
			if (!current.host && !current.guest) rooms.delete(room);
			log(`leave room=${room} role=${role}`);
		},
	});
});

// ── 최소 WebSocket 프레이밍 (RFC 6455, 텍스트 프레임 전용) ──────────────────

/** 소켓에서 프레임을 파싱해 텍스트/종료 콜백을 호출. TCP 분할을 버퍼링 처리. */
function readFrames(socket, { onText, onClose }) {
	let buffer = Buffer.alloc(0);
	let closed = false;

	const finish = () => {
		if (closed) return;
		closed = true;
		onClose();
	};

	socket.on('data', (chunk) => {
		buffer = Buffer.concat([buffer, chunk]);
		// 버퍼에서 가능한 만큼 프레임을 꺼낸다
		// eslint-disable-next-line no-constant-condition
		while (true) {
			if (buffer.length < 2) return;
			const b0 = buffer[0];
			const b1 = buffer[1];
			const opcode = b0 & 0x0f;
			const masked = (b1 & 0x80) !== 0;
			let len = b1 & 0x7f;
			let offset = 2;

			if (len === 126) {
				if (buffer.length < offset + 2) return;
				len = buffer.readUInt16BE(offset);
				offset += 2;
			} else if (len === 127) {
				if (buffer.length < offset + 8) return;
				const big = buffer.readBigUInt64BE(offset);
				len = Number(big);
				offset += 8;
			}

			let maskKey = null;
			if (masked) {
				if (buffer.length < offset + 4) return;
				maskKey = buffer.subarray(offset, offset + 4);
				offset += 4;
			}

			if (buffer.length < offset + len) return; // 아직 페이로드 미완성
			const payload = Buffer.from(buffer.subarray(offset, offset + len));
			if (maskKey) {
				for (let i = 0; i < payload.length; i++) {
					payload[i] ^= maskKey[i & 3];
				}
			}
			buffer = buffer.subarray(offset + len);

			if (opcode === 0x8) {
				// close
				try {
					socket.end(buildFrame(Buffer.alloc(0), 0x8));
				} catch {
					/* noop */
				}
				finish();
				return;
			} else if (opcode === 0x9) {
				// ping → pong
				sendRaw(socket, buildFrame(payload, 0xa));
			} else if (opcode === 0xa) {
				// pong, 무시
			} else if (opcode === 0x1 || opcode === 0x0) {
				// 텍스트 (조각화는 시그널링 용도에선 사실상 없음)
				onText(payload.toString('utf8'));
			}
		}
	});

	// 'end'는 상대가 FIN을 보낼 때(정상 종료·소켓 destroy) 발화한다. 업그레이드된
	// 소켓은 하프오픈 상태로 남아 'close'가 늦으므로 'end'까지 함께 감지해야 한다.
	socket.on('end', finish);
	socket.on('close', finish);
	socket.on('error', finish);
}

function buildFrame(payload, opcode) {
	const len = payload.length;
	let header;
	if (len < 126) {
		header = Buffer.alloc(2);
		header[1] = len;
	} else if (len < 65536) {
		header = Buffer.alloc(4);
		header[1] = 126;
		header.writeUInt16BE(len, 2);
	} else {
		header = Buffer.alloc(10);
		header[1] = 127;
		header.writeBigUInt64BE(BigInt(len), 2);
	}
	header[0] = 0x80 | (opcode & 0x0f); // FIN=1
	return Buffer.concat([header, payload]);
}

function sendRaw(socket, frame) {
	try {
		if (socket.writable) socket.write(frame);
	} catch {
		/* noop */
	}
}

function sendFrame(socket, text) {
	sendRaw(socket, buildFrame(Buffer.from(text, 'utf8'), 0x1));
}

function log(msg) {
	// 타임스탬프는 배포 로그에서 유용하지만 민감정보는 남기지 않는다(room/role만).
	console.log(`[signaling] ${msg}`);
}

server.listen(PORT, () => {
	console.log(`[signaling] listening on :${PORT}  (ws://…/?room=<name>&role=host|guest)`);
});
