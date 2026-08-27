import { NetSession, NetRole } from './NetSession.js';
import { LoopbackConnection, BroadcastChannelConnection } from './Connection.js';
import { CONTROL_BIT } from './InputCodec.js';
import { readLocalInputBits, applyRemoteInput } from '../engine/InputHandler.js';
import { Control } from '../constants/controls.js';
import { BattleScene } from '../scenes/BattleScene.js';

/**
 * 넷플레이 부트스트랩. URL 파라미터가 없으면 아무 것도 하지 않으므로
 * 일반 로컬 플레이는 전혀 영향받지 않는다.
 *
 * 모드 (?net=...):
 *   hostdemo  단일 PC·단일 탭 데모: 인메모리 루프백 + "스크립트 게스트"가 P1(Ryu)을
 *             자동 조작. 전 경로(전송+세션+입력주입) 눈으로 확인. 인터넷 조건 흉내:
 *               ?net=hostdemo&latency=60&loss=0.05
 *   host      실제 2-탭 대전의 호스트. 시뮬 실행 + 상태 전송, P1은 게스트가 조작.
 *   guest     실제 2-탭 대전의 게스트. 렌더 전용 — 호스트 상태를 그리고 WASD 전송.
 *
 * host/guest는 BroadcastChannel(같은 오리진 두 탭)로 연결된다. 방 이름은 ?room=..., 기본
 * 'streetfighter-net'. 두 탭을 같은 room으로 열면 붙는다.
 * (WebRTC 전송·실제 원격 매칭은 Phase 2에서 같은 Connection 인터페이스로 드롭인)
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
		default:
			console.warn(`[netplay] 알 수 없는 net 모드: "${mode}"`);
	}
};

const roomName = (params) => params.get('room') ?? 'streetfighter-net';

// 실제 2-탭 호스트: 시뮬 실행 + 상태 전송, 게스트 입력을 P1에 주입.
const startHost = (game, params) => {
	const connection = new BroadcastChannelConnection(roomName(params));
	game.mode = 'host';
	game.netSession = new NetSession({
		role: NetRole.HOST,
		connection,
		io: realIo,
		remotePlayerId: 1,
	});
	console.log(
		`[netplay] host (room=${roomName(params)}). 매치를 시작하세요. ` +
			`P1(Ryu)은 게스트 탭이 조작합니다.`
	);
};

// 실제 2-탭 게스트: 렌더 전용. 호스트 상태를 그리고 로컬 WASD를 전송.
const startGuest = (game, params) => {
	const connection = new BroadcastChannelConnection(roomName(params));
	game.mode = 'guest';
	game.netSession = new NetSession({
		role: NetRole.GUEST,
		connection,
		io: realIo,
		localPlayerIndex: 0, // 게스트는 로컬에서 P0 키(WASD)로 조작
	});
	game.startScene(BattleScene); // 메뉴 대신 바로 배틀 화면(렌더 대상)으로
	console.log(
		`[netplay] guest (room=${roomName(params)}). 호스트 화면을 렌더링합니다. ` +
			`WASD+QERFVG로 P1을 조작하세요.`
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
