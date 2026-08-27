/**
 * WebRTC DataChannel 전송 — Connection 인터페이스의 실전(원격) 구현.
 *
 * LoopbackConnection / BroadcastChannelConnection 과 동일한 계약
 * (send / onMessage / onOpen / onClose / isOpen / close)을 제공하므로
 * NetSession·게임 루프는 무엇을 쓰는지 전혀 몰라도 된다 → "드롭인".
 *
 * DataChannel은 { ordered:false, maxRetransmits:0 } 으로 연다:
 *   순서 보장·재전송 없음 = UDP에 가까운 동작. 격투게임 입력/상태는 "최신값이 곧
 *   정답"이라 옛 패킷 재전송은 오히려 지연만 늘린다(HOL 블로킹). 우리 프로토콜은
 *   이미 프레임/시퀀스로 옛 패킷을 폐기하므로 비신뢰 채널이 정확히 맞다.
 *
 * RTCPeerConnection/RTCDataChannel 은 브라우저 전역이지만, 기본 pcFactory가
 * 호출될 때만 참조되므로 이 파일을 import만 하는 것은 node에서도 안전하다.
 */
export class WebRTCConnection {
	#pc;
	#channel = null;
	#open = false;
	#messageHandlers = [];
	#openHandlers = [];
	#closeHandlers = [];

	constructor(pc) {
		this.#pc = pc;
	}

	/** 데이터 채널을 결합(호스트는 생성 채널, 게스트는 ondatachannel 수신 채널). */
	bindChannel(channel) {
		this.#channel = channel;
		try {
			channel.binaryType = 'arraybuffer';
		} catch {
			/* 일부 구현은 setter가 없을 수 있음 */
		}
		channel.onopen = () => {
			this.#open = true;
			for (const handler of this.#openHandlers) handler();
		};
		channel.onclose = () => {
			if (!this.#open) return;
			this.#open = false;
			for (const handler of this.#closeHandlers) handler();
		};
		channel.onmessage = (event) => {
			for (const handler of this.#messageHandlers) handler(event.data);
		};
		if (channel.readyState === 'open') channel.onopen();
	}

	get isOpen() {
		return this.#open;
	}

	send(data) {
		if (this.#open) this.#channel.send(data);
	}

	onMessage(handler) {
		this.#messageHandlers.push(handler);
		return this;
	}

	onOpen(handler) {
		this.#openHandlers.push(handler);
		if (this.#open) handler();
		return this;
	}

	onClose(handler) {
		this.#closeHandlers.push(handler);
		return this;
	}

	close() {
		this.#open = false;
		try {
			this.#channel?.close();
		} catch {
			/* noop */
		}
		try {
			this.#pc?.close();
		} catch {
			/* noop */
		}
		for (const handler of this.#closeHandlers) handler();
	}
}

const DEFAULT_ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

/**
 * 시그널링을 통해 WebRTC 협상을 수행하고, 열리면 동작하는 WebRTCConnection을 반환.
 * 반환은 즉시 이뤄지며(채널은 아직 미개통), 연결이 실제로 열리면 onOpen이 발화한다.
 * NetSession은 isOpen이 true가 되기 전엔 update()에서 no-op이므로 그대로 넘겨도 안전.
 *
 * 협상 순서:
 *   host  : DataChannel 생성 → (상대 입장 'ready') → offer 생성/전송 → answer 수신
 *   guest : offer 수신 → answer 생성/전송, ondatachannel 로 채널 수신
 * ICE 후보는 양쪽 모두 생기는 대로 트리클 전송. 원격 설명이 아직이면 버퍼링 후 반영.
 *
 * @param {Object} opts
 * @param {'host'|'guest'} opts.role
 * @param {Object} opts.signaling  SignalingClient (onSignal/onReady/send)
 * @param {Object} [opts.rtcConfig] RTCPeerConnection 설정 { iceServers }
 * @param {Function} [opts.pcFactory] 테스트용 주입 (기본: new RTCPeerConnection)
 * @param {string} [opts.channelName]
 * @returns {WebRTCConnection}
 */
export const createWebRTCConnection = ({
	role,
	signaling,
	rtcConfig = { iceServers: DEFAULT_ICE_SERVERS },
	pcFactory = (config) => new RTCPeerConnection(config),
	channelName = 'game',
}) => {
	const pc = pcFactory(rtcConfig);
	const conn = new WebRTCConnection(pc);

	const pendingCandidates = [];
	let remoteSet = false;

	pc.onicecandidate = (event) => {
		if (event.candidate) {
			signaling.send({ t: 'candidate', candidate: event.candidate });
		}
	};

	const drainCandidates = async () => {
		remoteSet = true;
		while (pendingCandidates.length) {
			try {
				await pc.addIceCandidate(pendingCandidates.shift());
			} catch {
				/* 잘못된 후보는 무시 */
			}
		}
	};

	signaling.onSignal(async (msg) => {
		try {
			if (msg.t === 'offer') {
				await pc.setRemoteDescription(msg.sdp);
				await drainCandidates();
				const answer = await pc.createAnswer();
				await pc.setLocalDescription(answer);
				signaling.send({ t: 'answer', sdp: answer });
			} else if (msg.t === 'answer') {
				await pc.setRemoteDescription(msg.sdp);
				await drainCandidates();
			} else if (msg.t === 'candidate' && msg.candidate) {
				if (remoteSet) {
					try {
						await pc.addIceCandidate(msg.candidate);
					} catch {
						/* noop */
					}
				} else {
					pendingCandidates.push(msg.candidate);
				}
			}
		} catch (err) {
			console.error('[webrtc] 시그널 처리 실패:', err);
		}
	});

	if (role === 'host') {
		const channel = pc.createDataChannel(channelName, {
			ordered: false,
			maxRetransmits: 0,
		});
		conn.bindChannel(channel);
		// 상대가 방에 들어오면 서버가 'ready'를 보낸다 → 그때 offer 생성(경합 방지).
		signaling.onReady(async () => {
			try {
				const offer = await pc.createOffer();
				await pc.setLocalDescription(offer);
				signaling.send({ t: 'offer', sdp: offer });
			} catch (err) {
				console.error('[webrtc] offer 생성 실패:', err);
			}
		});
	} else {
		pc.ondatachannel = (event) => conn.bindChannel(event.channel);
	}

	return conn;
};

/**
 * 매치메이킹 연결: 역할을 서버가 배정한다. 시그널링에 create/join 의도로 접속해
 * 'assigned'를 받은 시점에 그 역할로 WebRTCConnection을 만든다.
 *
 * onAssigned 안에서 createWebRTCConnection이 onSignal/onReady를 동기 등록하므로,
 * 뒤이어 오는 offer/ready 메시지를 놓치지 않는다(WS 메시지는 순서 보장).
 *
 * @returns {Promise<{ connection: WebRTCConnection, role: 'host'|'guest' }>}
 *          방 규칙 위반 시('room-exists'|'room-not-found'|'room-full'…) reject.
 */
export const createMatchmadeConnection = ({
	signaling,
	rtcConfig,
	pcFactory,
	channelName,
}) =>
	new Promise((resolve, reject) => {
		let settled = false;
		signaling.onAssigned((role) => {
			if (settled) return;
			settled = true;
			const connection = createWebRTCConnection({
				role,
				signaling,
				rtcConfig,
				pcFactory,
				channelName,
			});
			resolve({ connection, role });
		});
		signaling.onError((reason) => {
			if (settled) return;
			settled = true;
			reject(new Error(reason));
		});
		signaling.connect().catch((err) => {
			if (settled) return;
			settled = true;
			reject(err);
		});
	});
