/**
 * 피어 간 메시지 프로토콜.
 *
 * 전송 계층(Connection)은 문자열/바이너리를 그대로 실어나르기만 하고,
 * "무슨 메시지인가"는 여기서 정의한다. MVP는 디버깅 편의를 위해 JSON을 쓰되,
 * encode/decode를 단일 접점으로 두어 나중에 입력 핫패스만 바이너리로
 * 교체할 수 있게 한다. (입력 1프레임 = 2바이트라 대역폭은 어차피 무시할 수준)
 */
export const MessageType = {
	HELLO: 'hello', // 연결 직후 역할/버전 교환
	INPUT: 'input', // 게스트 → 호스트: 프레임 입력 비트마스크
	STATE: 'state', // 호스트 → 게스트: 직렬화된 렌더 상태 (Phase 1)
	PING: 'ping', // RTT 측정
	PONG: 'pong',
};

export const PROTOCOL_VERSION = 1;

/** 게스트가 매 프레임 보내는 입력 메시지. */
export const inputMessage = (frame, bits) => ({
	t: MessageType.INPUT,
	f: frame,
	b: bits,
});

/** 연결 직후 핸드셰이크 메시지. */
export const helloMessage = (role) => ({
	t: MessageType.HELLO,
	v: PROTOCOL_VERSION,
	role,
});

/** RTT 측정용. sentAt은 보낸 쪽 로컬 타임스탬프(그대로 에코). */
export const pingMessage = (sentAt) => ({ t: MessageType.PING, s: sentAt });
export const pongMessage = (sentAt) => ({ t: MessageType.PONG, s: sentAt });

/** 와이어 인코딩 (현재 JSON — 단일 교체 지점). */
export const encode = (message) => JSON.stringify(message);
export const decode = (raw) => JSON.parse(raw);
