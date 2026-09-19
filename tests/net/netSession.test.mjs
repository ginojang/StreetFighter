import { test } from 'node:test';
import assert from 'node:assert/strict';

// 게임 모듈 import 전에 DOM 스톱 설치 (NetSession → StateCodec → fighters 사슬)
import { installDomStubs } from '../helpers/domStub.mjs';
installDomStubs();

const { NetSession, NetRole } = await import('../../src/net/NetSession.js');
const {
	LoopbackConnection,
	BroadcastChannelConnection,
} = await import('../../src/net/Connection.js');
const { encode, inputMessage, pingMessage } = await import(
	'../../src/net/protocol.js'
);
const { CONTROL_BIT } = await import('../../src/net/InputCodec.js');
const { Control } = await import('../../src/constants/controls.js');
const { EntityList } = await import('../../src/engine/EntityList.js');

const BITS_A = CONTROL_BIT[Control.LEFT];
const BITS_B = CONTROL_BIT[Control.RIGHT] | CONTROL_BIT[Control.HEAVY_KICK];

const makePair = () => {
	const [hostConn, guestConn] = LoopbackConnection.createPair();
	const applied = [];
	const host = new NetSession({
		role: NetRole.HOST,
		connection: hostConn,
		io: {
			readLocalInputBits: () => 0,
			applyRemoteInput: (id, bits) => applied.push([id, bits]),
		},
	});
	const guest = new NetSession({
		role: NetRole.GUEST,
		connection: guestConn,
		io: {
			readLocalInputBits: () => BITS_A,
			applyRemoteInput() {},
		},
	});
	return { hostConn, guestConn, host, guest, applied };
};

const makeBattleScene = () => ({
	camera: { position: { x: 5, y: 0 } },
	FighterDrawOrder: [0, 1],
	winnerId: undefined,
	overlays: [
		{
			time: 60,
			healthBars: [{ hitPoints: 0 }, { hitPoints: 0 }],
			startingHealthRollUpDone: true,
		},
	],
	fighters: [
		{
			currentState: 'idle',
			animationFrame: 0,
			direction: 1,
			position: { x: 100, y: 218 },
			hurtShake: 0,
		},
		{
			currentState: 'idle',
			animationFrame: 0,
			direction: -1,
			position: { x: 300, y: 218 },
			hurtShake: 0,
		},
	],
	entities: new EntityList(),
});

test('GUEST는 매 update마다 로컬 입력을 INPUT으로 송신한다', () => {
	const { hostConn, guest } = makePair();
	// 게스트가 송신한 INPUT은 “호스트 쪽” 연결 단말에서 수신된다(송신 단말은 자기 메시지를 안 받음).
	const received = [];
	hostConn.onMessage((raw) => received.push(JSON.parse(raw)));
	guest.update();
	guest.update();
	guest.update();
	assert.equal(received.length, 3);
	assert.deepEqual(received[0], { t: 'input', f: 0, b: BITS_A });
	assert.deepEqual(received[2], { t: 'input', f: 2, b: BITS_A });
});

test('HOST: 최신 게스트 입력을 원격 슬롯(기본 P2=1)에 매 update 1회 주입', () => {
	const { guest, host, applied } = makePair();
	guest.update();
	host.update();
	assert.equal(applied.length, 1);
	assert.deepEqual(applied[0], [1, BITS_A]);
});

test('HOST: 새 패킷이 없으면 직전 입력을 유지(키 홀드)', () => {
	const { guest, host, applied } = makePair();
	guest.update();
	host.update();
	host.update(); // 새 INPUT 없음
	assert.equal(applied.length, 2);
	assert.deepEqual(applied[1], [1, BITS_A]);
});

test('비신뢰 전송: 순서 뒤바뀐(낮은 프레임) INPUT은 폐기된다', () => {
	const { guestConn, host, applied } = makePair();
	guestConn.send(encode(inputMessage(5, BITS_A)));
	guestConn.send(encode(inputMessage(3, BITS_B))); // 오래된 프레임
	host.update();
	assert.equal(applied.length, 1);
	assert.deepEqual(applied[0], [1, BITS_A]); // f=5 값 채택
});

test('손상된 프레임은 조용히 무시되고, 이후 정상 프레임은 처리된다', () => {
	const { guestConn, host, applied } = makePair();
	guestConn.send('{{not-json');
	guestConn.send(encode(inputMessage(1, BITS_B)));
	host.update();
	assert.equal(applied.length, 1);
	assert.deepEqual(applied[0], [1, BITS_B]);
});

test('PING → PONG: RTT가 주입된 now()로 계산된다', () => {
	const [hostConn, guestConn] = LoopbackConnection.createPair();
	const host = new NetSession({
		role: NetRole.HOST,
		connection: hostConn,
		io: { readLocalInputBits: () => 0, applyRemoteInput() {} },
		now: () => 1000,
	});
	new NetSession({
		role: NetRole.GUEST,
		connection: guestConn,
		io: { readLocalInputBits: () => 0, applyRemoteInput() {} },
	});
	assert.equal(host.rtt, null);
	hostConn.send(encode(pingMessage(123))); // 0-지연 루프백 → 동기 전달
	assert.equal(host.rtt, 1000 - 123);
});

test('STATE: 최신 시퀀스만 채택되고 게스트 씬에 적용된다', () => {
	const { host, guest } = makePair();
	const scene = makeBattleScene();
	const gameState = {
		fighters: [
			{ hitPoints: 90, score: 0 },
			{ hitPoints: 80, score: 0 },
		],
	};

	host.sendState(scene, gameState); // seq 0
	scene.fighters[0].position.x = 150;
	host.sendState(scene, gameState); // seq 1

	const guestScene = makeBattleScene();
	const guestGameState = {
		fighters: [
			{ hitPoints: 100, score: 0 },
			{ hitPoints: 100, score: 0 },
		],
	};
	guest.applyLatestState(guestScene, guestGameState);
	assert.equal(guestScene.fighters[0].position.x, 150); // seq 1 값
	assert.equal(guestGameState.fighters[0].hitPoints, 90);
});

test('STATE: 낮은 시퀀스 스냅샷은 늦게 와도 폐기된다', () => {
	const { hostConn, host, guest } = makePair();
	const scene = makeBattleScene();
	host.sendState(scene, makeGameStateFor(scene), 1); // latestStateSeq = 1
	// 오래된 seq 0을 몰래 주입
	hostConn.send(
		JSON.stringify({
			t: 'state',
			f: 0,
			cam: { x: -999, y: 0 },
			ord: [1, 0],
			win: -1,
			tm: 1,
			ft: [],
			gs: [],
			ent: [],
		})
	);
	const guestScene = makeBattleScene();
	guest.applyLatestState(guestScene, makeGameStateFor(scene));
	assert.notEqual(guestScene.camera.position.x, -999); // stale 미적용
});

const makeGameStateFor = () => ({
	fighters: [
		{ hitPoints: 90, score: 0 },
		{ hitPoints: 80, score: 0 },
	],
});

test('연결 종료 후 sendState는 no-op (예외 없음, 미전달)', () => {
	const { hostConn, host, guest } = makePair();
	const delivered = [];
	guest.connection.onMessage((raw) => delivered.push(raw));
	hostConn.close();
	const scene = makeBattleScene();
	host.sendState(scene, makeGameStateFor());
	assert.equal(delivered.length, 0);
	assert.doesNotThrow(() => host.update());
});

test('HELLO 등 미지정 타입은 무시된다 (추가돼도 크래시 없음)', () => {
	const { guestConn, host } = makePair();
	assert.doesNotThrow(() => {
		guestConn.send(encode({ t: 'hello', v: 1, role: 'guest' }));
	});
	host.update(); // 정상 동작 확인
});

// ── LoopbackConnection 전송 시뮬 ─────────────────────────────────────────

test('LoopbackConnection: lossRate로 패킷이 유실된다', () => {
	const origRandom = Math.random;
	Math.random = () => 0.0; // 항상 loss 조건(0 < 0.5) 성립
	try {
		const [a, b] = LoopbackConnection.createPair({ lossRate: 0.5 });
		const got = [];
		b.onMessage((d) => got.push(d));
		a.send('x');
		assert.equal(got.length, 0);
	} finally {
		Math.random = origRandom;
	}
});

test('LoopbackConnection: latencyMs만큼 지연 전달된다', async () => {
	const [a, b] = LoopbackConnection.createPair({ latencyMs: 10 });
	const got = [];
	b.onMessage((d) => got.push(d));
	a.send('late');
	assert.equal(got.length, 0); // 즉시는 아직
	await new Promise((resolve) => setTimeout(resolve, 40));
	assert.deepEqual(got, ['late']);
});

test('LoopbackConnection: close는 양쪽 모두 종료하고 onClose를 발화', () => {
	const [a, b] = LoopbackConnection.createPair();
	const closedA = [];
	const closedB = [];
	a.onClose(() => closedA.push(1));
	b.onClose(() => closedB.push(1));
	a.close();
	assert.equal(a.isOpen, false);
	assert.equal(b.isOpen, false); // 피어도 함께 종료
	assert.equal(closedA.length, 1);
	assert.equal(closedB.length, 1);
	// 닫힌 후 송신은 no-op
	assert.doesNotThrow(() => a.send('void'));
});

test('LoopbackConnection: onOpen 등록 시 이미 열려 있으면 즉시 발화', () => {
	const [a] = LoopbackConnection.createPair();
	let opened = 0;
	a.onOpen(() => (opened += 1));
	assert.equal(opened, 1);
});

// ── BroadcastChannelConnection: 인터페이스 계약(전송 없이) ───────────────

test('BroadcastChannelConnection: send는 에코 없이 피어로만 (인터페이스 계약)', () => {
	// node엔 BroadcastChannel이 없다 — 스톱 채널로 계약(에코 없음)만 검증.
	const delivered = [];
	class FakeChannel {
		constructor(name) {
			this.name = name;
		}
		postMessage(data) {
			delivered.push(data); // 브라우저 규약: 자기 자신에겐 전달 안 됨
		}
		close() {}
	}
	globalThis.BroadcastChannel = FakeChannel;
	try {
		const conn = new BroadcastChannelConnection('test-room');
		const got = [];
		conn.onMessage((d) => got.push(d));
		conn.send('hello');
		assert.equal(got.length, 0); // 자기 메시지를 자기가 안 받음
		assert.deepEqual(delivered, ['hello']);
		assert.equal(conn.isOpen, true);
		conn.close();
		assert.equal(conn.isOpen, false);
	} finally {
		delete globalThis.BroadcastChannel;
	}
});
