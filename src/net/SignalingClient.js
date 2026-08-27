/**
 * 시그널링 클라이언트 (WebSocket).
 *
 * WebRTC 연결을 맺으려면 두 피어가 SDP(offer/answer)와 ICE 후보를 서로
 * 교환해야 하는데, 아직 P2P 채널이 없으므로 이 최초 교환만 서버를 거친다.
 * → 시그널링은 "연결을 맺기 위한 악수"일 뿐, 실시간 입력/상태는 절대 여기로
 *   흐르지 않는다. 악수가 끝나면 WebRTC DataChannel(P2P/UDP)로 직접 오간다.
 *
 * 서버 메시지:
 *   { t:'ready' }        상대가 같은 room에 들어와 협상 시작 가능
 *   { t:'offer', sdp }   / { t:'answer', sdp } / { t:'candidate', candidate }
 *   { t:'peer-left' }    상대 이탈
 *
 * WebSocket은 브라우저 전역이므로 connect() 호출 시점에만 참조한다
 * (node import 안전 — 게임 코드는 이 파일을 import만 해도 문제없음).
 */
export class SignalingClient {
	#ws = null;
	#url;
	#room;
	#role;
	#signalHandlers = [];
	#readyHandlers = [];
	#closeHandlers = [];

	/**
	 * @param {Object} opts
	 * @param {string} opts.url   시그널링 서버 URL (ws:// 또는 wss://)
	 * @param {string} opts.room  방 이름 (두 피어가 같은 값으로 만나야 붙는다)
	 * @param {'host'|'guest'} opts.role
	 */
	constructor({ url, room, role }) {
		this.#url = url;
		this.#room = room;
		this.#role = role;
	}

	/** WebSocket 연결. onSignal/onReady 핸들러는 connect() 전에 등록해야 유실이 없다. */
	connect() {
		return new Promise((resolve, reject) => {
			const sep = this.#url.includes('?') ? '&' : '?';
			const url =
				`${this.#url}${sep}room=${encodeURIComponent(this.#room)}` +
				`&role=${encodeURIComponent(this.#role)}`;
			this.#ws = new WebSocket(url);
			this.#ws.onopen = () => resolve();
			this.#ws.onerror = (event) => reject(event);
			this.#ws.onclose = () => {
				for (const handler of this.#closeHandlers) handler();
			};
			this.#ws.onmessage = (event) => {
				let msg;
				try {
					msg = JSON.parse(event.data);
				} catch {
					return;
				}
				if (msg.t === 'ready') {
					for (const handler of this.#readyHandlers) handler();
				} else {
					for (const handler of this.#signalHandlers) handler(msg);
				}
			};
		});
	}

	/** offer/answer/candidate 전송. */
	send(msg) {
		if (this.#ws && this.#ws.readyState === 1 /* OPEN */) {
			this.#ws.send(JSON.stringify(msg));
		}
	}

	onSignal(handler) {
		this.#signalHandlers.push(handler);
		return this;
	}

	onReady(handler) {
		this.#readyHandlers.push(handler);
		return this;
	}

	onClose(handler) {
		this.#closeHandlers.push(handler);
		return this;
	}

	close() {
		try {
			this.#ws?.close();
		} catch {
			/* noop */
		}
	}
}
