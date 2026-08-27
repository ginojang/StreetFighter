/**
 * 전송 추상화 (Transport abstraction).
 *
 * 게임/세션 로직은 이 인터페이스에만 의존한다. 실제 전송이 인메모리 루프백이든
 * WebRTC DataChannel이든 관계없이 동일하게 동작하므로, Phase 2에서 WebRTC를
 * 같은 인터페이스로 "드롭인"할 수 있다.
 *
 * Connection 계약:
 *   send(data)          피어로 메시지 전송 (문자열 또는 ArrayBuffer)
 *   onMessage(fn)       메시지 수신 핸들러 등록  (fn(data))
 *   onOpen(fn)          연결 열림 핸들러 등록 (이미 열려 있으면 즉시 호출)
 *   onClose(fn)         연결 닫힘 핸들러 등록
 *   get isOpen()        현재 열림 여부
 *   close()             연결 종료
 */

/**
 * 단일 PC/단일 프로세스에서 호스트↔게스트 경로를 끝까지 검증하기 위한
 * 인메모리 전송. 인위적 지연(latencyMs)과 패킷 손실(lossRate)로 실제
 * UDP/인터넷 환경을 흉내 낼 수 있다.
 */
export class LoopbackConnection {
	#peer = null;
	#messageHandlers = [];
	#openHandlers = [];
	#closeHandlers = [];
	#open = false;

	/**
	 * @param {Object} opts
	 * @param {number} [opts.latencyMs=0] 편도 지연(ms). ping 시뮬레이션.
	 * @param {number} [opts.lossRate=0]  패킷 손실 확률 0..1. UDP 유실 시뮬.
	 */
	constructor({ latencyMs = 0, lossRate = 0 } = {}) {
		this.latencyMs = latencyMs;
		this.lossRate = lossRate;
	}

	/**
	 * 서로 연결된 두 엔드포인트 [a, b]를 생성한다. a.send() → b가 수신.
	 * 두 엔드포인트는 동일한 지연/손실 옵션을 공유한다.
	 */
	static createPair(opts = {}) {
		const a = new LoopbackConnection(opts);
		const b = new LoopbackConnection(opts);
		a.#peer = b;
		b.#peer = a;
		a.#open = true;
		b.#open = true;
		return [a, b];
	}

	get isOpen() {
		return this.#open;
	}

	send(data) {
		if (!this.#open || !this.#peer) return;
		if (this.lossRate > 0 && Math.random() < this.lossRate) return; // 유실
		const peer = this.#peer;
		const deliver = () => {
			if (peer.#open) peer.#receive(data);
		};
		if (this.latencyMs > 0) setTimeout(deliver, this.latencyMs);
		else deliver();
	}

	#receive(data) {
		for (const handler of this.#messageHandlers) handler(data);
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
		if (!this.#open) return;
		this.#open = false;
		for (const handler of this.#closeHandlers) handler();
		if (this.#peer && this.#peer.#open) this.#peer.close();
	}
}

/**
 * 같은 오리진의 두 탭/창을 잇는 전송 (BroadcastChannel 기반).
 * 시그널링 서버도 WebRTC도 없이 단일 PC에서 실제 2-탭 대전을 검증할 수 있다.
 * (BroadcastChannel은 보낸 쪽 자신에게는 에코하지 않음 → 호스트/게스트 분리에 적합)
 * Connection 인터페이스가 동일하므로 Phase 2의 WebRTCConnection이 그대로 대체 가능.
 */
export class BroadcastChannelConnection {
	#channel;
	#messageHandlers = [];
	#openHandlers = [];
	#closeHandlers = [];
	#open = false;

	constructor(name = 'streetfighter-net') {
		this.#channel = new BroadcastChannel(name);
		this.#channel.onmessage = (event) => {
			for (const handler of this.#messageHandlers) handler(event.data);
		};
		this.#open = true;
	}

	get isOpen() {
		return this.#open;
	}

	send(data) {
		if (this.#open) this.#channel.postMessage(data);
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
		if (!this.#open) return;
		this.#open = false;
		this.#channel.close();
		for (const handler of this.#closeHandlers) handler();
	}
}
