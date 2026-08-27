import {
	MessageType,
	decode,
	encode,
	inputMessage,
	pongMessage,
} from './protocol.js';
import { serializeBattleState, applyBattleState } from './StateCodec.js';

export const NetRole = {
	HOST: 'host', // 시뮬 실행 + 게스트 입력을 원격 슬롯에 주입 (권위)
	GUEST: 'guest', // 로컬 입력만 매 프레임 전송
};

/**
 * 호스트-권위 P2P 세션 오케스트레이터.
 *
 * 전송(Connection)과 입력 I/O를 주입받아, 매 프레임 역할에 맞는 한 가지 일만 한다:
 *   - GUEST: 로컬 입력을 캡처해 INPUT 메시지로 전송
 *   - HOST : 게스트에게 받은 "가장 최신" 입력을 원격 플레이어 슬롯에 주입
 *
 * 네트워크 수신은 비동기(onMessage)로 버퍼링하고, update()에서 최신값을 적용한다.
 * → 패킷이 늦거나 유실되면 직전 입력을 유지(hold)하는 표준 동작. 다음 패킷에 자동 보정.
 *
 * io는 InputHandler에 대한 의존을 끊기 위한 어댑터:
 *   io.readLocalInputBits(index) : number   로컬 입력 → 비트마스크
 *   io.applyRemoteInput(playerId, bits)      비트마스크 → 게임 슬롯 주입
 */
export class NetSession {
	constructor({
		role,
		connection,
		io,
		localPlayerIndex = 0, // 게스트가 로컬 조작에 쓰는 컨트롤 매핑 (0 = WASD)
		remotePlayerId = 1, // 호스트가 원격 입력을 주입할 게임 슬롯 (1 = P2)
		now,
	}) {
		this.role = role;
		this.connection = connection;
		this.io = io;
		this.localPlayerIndex = localPlayerIndex;
		this.remotePlayerId = remotePlayerId;
		this.now = now ?? defaultNow;

		this.frame = 0;
		this.remoteBits = 0; // 호스트: 마지막으로 알려진 게스트 입력
		this.remoteFrame = -1; // 지금까지 본 가장 큰 입력 프레임 (순서 뒤바뀐 패킷 폐기용)
		this.rtt = null; // 왕복 지연(ms), PONG 수신 시 갱신

		this.stateSeq = 0; // 호스트: 보낸 STATE 스냅샷 시퀀스
		this.latestState = null; // 게스트: 가장 최신 STATE 스냅샷
		this.latestStateSeq = -1; // 게스트: 지금까지 본 가장 큰 STATE 시퀀스

		this.connection.onMessage((raw) => this._onMessage(raw));
	}

	_onMessage(raw) {
		let msg;
		try {
			msg = decode(raw);
		} catch {
			return; // 손상 프레임 무시
		}
		switch (msg.t) {
			case MessageType.INPUT:
				// 비신뢰 전송 → 순서 뒤바뀜 가능. 최신 프레임만 채택.
				if (msg.f > this.remoteFrame) {
					this.remoteFrame = msg.f;
					this.remoteBits = msg.b;
				}
				break;
			case MessageType.PING:
				this.connection.send(encode(pongMessage(msg.s)));
				break;
			case MessageType.PONG:
				this.rtt = this.now() - msg.s;
				break;
			case MessageType.STATE:
				// 게스트: 순서 뒤바뀐 스냅샷 폐기, 최신만 유지.
				if (msg.f > this.latestStateSeq) {
					this.latestStateSeq = msg.f;
					this.latestState = msg;
				}
				break;
		}
	}

	/** HOST: 시뮬(scene.update) 이후 호출 — 현재 배틀 상태를 스냅샷으로 전송. */
	sendState(scene, gameState) {
		if (!this.connection.isOpen) return;
		this.connection.send(
			encode(serializeBattleState(scene, gameState, this.stateSeq++))
		);
	}

	/** GUEST: 매 프레임 그리기 직전 호출 — 최신 스냅샷을 로컬 씬에 적용. */
	applyLatestState(scene, gameState) {
		if (this.latestState) applyBattleState(scene, gameState, this.latestState);
	}

	/** 게임 루프에서 매 프레임 1회, 시뮬(scene.update)보다 먼저 호출. */
	update() {
		if (!this.connection.isOpen) return;

		if (this.role === NetRole.GUEST) {
			const bits = this.io.readLocalInputBits(this.localPlayerIndex);
			this.connection.send(encode(inputMessage(this.frame, bits)));
		} else {
			// HOST: 가장 최신 게스트 입력을 원격 슬롯에 주입.
			// 새 패킷이 없어도 직전 입력을 유지(키 홀드) → 올바른 동작.
			this.io.applyRemoteInput(this.remotePlayerId, this.remoteBits);
		}

		this.frame++;
	}
}

const defaultNow = () =>
	typeof performance !== 'undefined' && performance.now
		? performance.now()
		: 0;
