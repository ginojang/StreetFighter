import { NetSession, NetRole } from './NetSession.js';
import { LoopbackConnection } from './Connection.js';
import { CONTROL_BIT } from './InputCodec.js';
import { readLocalInputBits, applyRemoteInput } from '../engine/InputHandler.js';
import { Control } from '../constants/controls.js';

/**
 * 넷플레이 부트스트랩. URL 파라미터가 없으면 아무 것도 하지 않으므로
 * 일반 로컬 플레이는 전혀 영향받지 않는다.
 *
 * ?net=hostdemo  단일 PC 데모: 인메모리 루프백으로 "스크립트 게스트"의 입력을
 *                호스트가 받아 게임 P1(Ryu)에 주입한다. 매치를 시작하면 Ryu가
 *                네트워크 입력만으로 스스로 움직이는 것으로 전 경로(전송+세션+주입)를
 *                눈으로 확인할 수 있다. 실제 인터넷 조건 흉내:
 *                  ?net=hostdemo&latency=60&loss=0.05
 *
 * (WebRTC 전송과 실제 2인 매칭은 Phase 2에서 같은 인터페이스로 드롭인 예정)
 */
export const bootNetplay = (game) => {
	const params = new URLSearchParams(location.search);
	const mode = params.get('net');
	if (!mode) return;

	if (mode === 'hostdemo') {
		startHostDemo(game, params);
	} else {
		console.warn(`[netplay] 알 수 없는 net 모드: "${mode}"`);
	}
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
