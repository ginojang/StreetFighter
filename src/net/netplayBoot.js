import { NetSession, NetRole } from './NetSession.js';
import { LoopbackConnection, BroadcastChannelConnection } from './Connection.js';
import { CONTROL_BIT } from './InputCodec.js';
import { readLocalInputBits, applyRemoteInput } from '../engine/InputHandler.js';
import { Control } from '../constants/controls.js';
import { BattleScene } from '../scenes/BattleScene.js';
import { SignalingClient } from './SignalingClient.js';
import {
	createWebRTCConnection,
	createMatchmadeConnection,
} from './WebRTCConnection.js';
import { openLobby, defaultSignalUrl } from './Lobby.js';

/**
 * 넷플레이 부트스트랩. URL 파라미터가 없으면 아무 것도 하지 않으므로
 * 일반 로컬 플레이는 전혀 영향받지 않는다.
 *
 * 모드 (?net=...):
 *   hostdemo  단일 PC·단일 탭 데모: 인메모리 루프백 + "스크립트 게스트"가 P1(Ryu)을
 *             자동 조작. 전 경로(전송+세션+입력주입) 눈으로 확인. 인터넷 조건 흉내:
 *               ?net=hostdemo&latency=60&loss=0.05
 *   host      대전 호스트(역할 직접 지정). 시뮬 실행 + 상태 전송, P1은 게스트가 조작.
 *   guest     대전 게스트(역할 직접 지정). 렌더 전용 — 호스트 상태를 그리고 WASD 전송.
 *   create    매치메이킹: 방을 만들고(서버가 host 배정) 방 코드를 발급. WebRTC 전용.
 *             ?room= 생략 시 코드 자동 생성(콘솔에 출력). ?signal= 필수.
 *   join      매치메이킹: 방 코드로 참가(서버가 guest 배정). ?room=코드 + ?signal= 필수.
 *   lobby     온라인 로비 UI(HTML 오버레이). 방 만들기/코드 참가를 화면에서. URL 불요.
 *             ?signal= 생략 시 현재 위치에서 기본 추정. ?room=코드면 참가 화면으로 시작.
 *
 * 전송 선택 (?transport=...):
 *   broadcast (기본)  BroadcastChannel — 같은 PC 두 탭. 서버·인터넷 불필요.
 *   webrtc            WebRTC DataChannel(P2P/UDP) — 진짜 원격. 최초 협상만 시그널링
 *                     서버를 거친다. ?signal=ws://호스트:포트 필수. 방은 ?room=.
 *                     STUN 커스텀 ?stun=, TURN 중계 ?turn=&turnuser=&turncred=
 *                     (TURN 자격증명은 런타임 값일 뿐 — 저장소에 커밋 금지).
 *
 * 예) 원격:
 *   호스트  ?net=host&transport=webrtc&signal=ws://1.2.3.4:8080&room=abc
 *   게스트  ?net=guest&transport=webrtc&signal=ws://1.2.3.4:8080&room=abc
 * Connection 인터페이스가 동일하므로 게임/세션 코드는 전송을 전혀 몰라도 된다.
 */
export const bootNetplay = (game) => {
	const params = new URLSearchParams(location.search);
	const mode = params.get('net');
	if (!mode) return;

	switch (mode) {
		case 'hostdemo':
			return startHostDemo(game, params);
		case 'host':
			return startHost(game, params);
		case 'guest':
			return startGuest(game, params);
		case 'create':
			return startMatchmaking(game, params, 'create');
		case 'join':
			return startMatchmaking(game, params, 'join');
		case 'lobby':
			return openLobby(game, {
				signalUrl: params.get('signal') ?? defaultSignalUrl(location),
				rtcConfig: buildRtcConfig(params),
				prefillRoom: params.get('room'),
			});
		default:
			console.warn(`[netplay] 알 수 없는 net 모드: "${mode}"`);
	}
};

const roomName = (params) => params.get('room') ?? 'streetfighter-net';

// 혼동하기 쉬운 문자(I/O/0/1)를 뺀 4자리 방 코드.
const randomRoomCode = () => {
	const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
	let code = '';
	for (let i = 0; i < 4; i++) {
		code += alphabet[Math.floor(Math.random() * alphabet.length)];
	}
	return code;
};

/**
 * 매치메이킹 부팅: 서버가 역할을 배정한다. create는 방을 만들고(host), join은 방
 * 코드로 참가(guest). 역할은 'assigned' 수신 시점에 정해지므로 그때 NetSession을
 * 구성한다(그 전까지 game.mode='local' — 무해). WebRTC 전용이라 ?signal= 필수.
 */
const startMatchmaking = (game, params, intent) => {
	const signalUrl = params.get('signal');
	if (!signalUrl) {
		console.error('[netplay] 매치메이킹에는 ?signal=ws://... 이 필요합니다.');
		return;
	}
	const room =
		params.get('room') ?? (intent === 'create' ? randomRoomCode() : null);
	if (!room) {
		console.error('[netplay] join 에는 ?room=<코드> 가 필요합니다.');
		return;
	}
	if (intent === 'create') {
		console.log(`[netplay] 방 코드: ${room} — 상대에게 공유하세요.`);
	}

	const signaling = new SignalingClient({ url: signalUrl, room, intent });
	createMatchmadeConnection({ signaling, rtcConfig: buildRtcConfig(params) })
		.then(({ connection, role }) => {
			if (role === 'host') {
				game.mode = 'host';
				game.netSession = new NetSession({
					role: NetRole.HOST,
					connection,
					io: realIo,
					remotePlayerId: 1,
				});
			} else {
				game.mode = 'guest';
				game.startScene(BattleScene);
				game.netSession = new NetSession({
					role: NetRole.GUEST,
					connection,
					io: realIo,
					localPlayerIndex: 0,
				});
			}
			console.log(`[netplay] 매치 성립 (role=${role}, room=${room}).`);
		})
		.catch((err) =>
			console.error(`[netplay] 매치메이킹 실패: ${err.message}`)
		);
};

/**
 * ?transport= 에 따라 Connection을 만든다. WebRTC는 협상이 비동기이므로
 * 채널이 아직 안 열린 Connection을 즉시 반환한다(열리면 onOpen 발화). NetSession은
 * isOpen 전엔 update()가 no-op이라 그대로 넘겨도 안전 → 부트는 동기로 유지된다.
 */
const makeConnection = (params, role) => {
	const transport = params.get('transport') ?? 'broadcast';
	if (transport === 'webrtc') {
		const signalUrl = params.get('signal');
		if (!signalUrl) {
			console.error(
				'[netplay] transport=webrtc 에는 ?signal=ws://... 시그널링 URL이 필요합니다.'
			);
			return null;
		}
		const signaling = new SignalingClient({
			url: signalUrl,
			room: roomName(params),
			role,
		});
		const connection = createWebRTCConnection({
			role,
			signaling,
			rtcConfig: buildRtcConfig(params),
		});
		// 핸들러(onSignal/onReady)는 createWebRTCConnection가 동기로 등록 → 이제 접속.
		signaling
			.connect()
			.then(() => console.log(`[netplay] 시그널링 접속됨 (${signalUrl})`))
			.catch((err) => console.error('[netplay] 시그널링 접속 실패:', err));
		return connection;
	}
	return new BroadcastChannelConnection(roomName(params));
};

/** ICE 설정. STUN은 공개 기본값, TURN 자격증명은 런타임 URL 파라미터로만. */
const buildRtcConfig = (params) => {
	const iceServers = [
		{ urls: params.get('stun') ?? 'stun:stun.l.google.com:19302' },
	];
	const turn = params.get('turn');
	if (turn) {
		iceServers.push({
			urls: turn,
			username: params.get('turnuser') ?? '',
			credential: params.get('turncred') ?? '',
		});
	}
	return { iceServers };
};

// 호스트: 시뮬 실행 + 상태 전송, 게스트 입력을 P1에 주입.
const startHost = (game, params) => {
	game.mode = 'host';
	const connection = makeConnection(params, 'host');
	if (!connection) return;
	game.netSession = new NetSession({
		role: NetRole.HOST,
		connection,
		io: realIo,
		remotePlayerId: 1,
	});
	console.log(
		`[netplay] host (room=${roomName(params)}). 매치를 시작하세요. ` +
			`P1(Ryu)은 게스트가 조작합니다.`
	);
};

// 게스트: 렌더 전용. 호스트 상태를 그리고 로컬 WASD를 전송.
const startGuest = (game, params) => {
	game.mode = 'guest';
	game.startScene(BattleScene); // 메뉴 대신 바로 배틀 화면(렌더 대상)으로
	const connection = makeConnection(params, 'guest');
	if (!connection) return;
	game.netSession = new NetSession({
		role: NetRole.GUEST,
		connection,
		io: realIo,
		localPlayerIndex: 0, // 게스트는 로컬에서 P0 키(WASD)로 조작
	});
	console.log(
		`[netplay] guest (room=${roomName(params)}). 호스트 화면을 렌더링합니다. ` +
			`WASD+QERFVG로 조작하세요.`
	);
};

// 로컬 InputHandler를 NetSession io 어댑터로 노출.
const realIo = { readLocalInputBits, applyRemoteInput };

const startHostDemo = (game, params) => {
	const latencyMs = Number(params.get('latency') ?? 0);
	const lossRate = Number(params.get('loss') ?? 0);
	const [hostConn, guestConn] = LoopbackConnection.createPair({
		latencyMs,
		lossRate,
	});

	// 호스트: 게임 루프가 매 프레임 update()를 호출 → 최신 원격 입력을 P1에 주입.
	game.netSession = new NetSession({
		role: NetRole.HOST,
		connection: hostConn,
		io: realIo,
		remotePlayerId: 1,
	});

	// 스크립트 게스트: 하드웨어 대신 정해진 입력 패턴을 매 프레임 송신.
	let frame = 0;
	const guest = new NetSession({
		role: NetRole.GUEST,
		connection: guestConn,
		io: { readLocalInputBits: () => scriptedInput(frame), applyRemoteInput() {} },
	});
	setInterval(() => {
		guest.update();
		frame += 1;
	}, 1000 / 60);

	console.log(
		`[netplay] hostdemo 활성 (latency=${latencyMs}ms, loss=${lossRate}). ` +
			`매치를 시작하면 P1(Ryu)이 네트워크 입력으로 자동 조작됩니다.`
	);
};

// 데모 입력 시퀀스: 오른쪽 이동 → 정지 → 점프 → 강펀치 → 왼쪽 복귀 (반복).
const scriptedInput = (frame) => {
	const t = frame % 240;
	if (t < 80) return CONTROL_BIT[Control.RIGHT];
	if (t < 120) return 0;
	if (t < 140) return CONTROL_BIT[Control.UP];
	if (t < 160) return 0;
	if (t < 180) return CONTROL_BIT[Control.HEAVY_PUNCH];
	if (t < 220) return CONTROL_BIT[Control.LEFT];
	return 0;
};
