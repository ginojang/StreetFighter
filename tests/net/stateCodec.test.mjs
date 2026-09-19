import { test } from 'node:test';
import assert from 'node:assert/strict';

// 게임 모듈 import 전에 DOM 스톱 설치 (utils/context → renderSettings 사슬)
import { installDomStubs } from '../helpers/domStub.mjs';
installDomStubs();

const { serializeBattleState, applyBattleState } = await import(
	'../../src/net/StateCodec.js'
);
const { serializeEntities, applyEntities, serializeEntity } = await import(
	'../../src/net/EntityCodec.js'
);
const { EntityList } = await import('../../src/engine/EntityList.js');
const { Fireball } = await import(
	'../../src/entitites/fighters/special/Fireball.js'
);
const { LightHitSplash } = await import(
	'../../src/entitites/fighters/shared/LightHitSplash.js'
);
const { FighterAttackStrength } = await import('../../src/constants/fighter.js');

const makeScene = () => ({
	camera: { position: { x: 11, y: 3 } },
	FighterDrawOrder: [0, 1],
	winnerId: undefined,
	overlays: [
		{
			time: 87,
			healthBars: [{ hitPoints: 0 }, { hitPoints: 0 }],
			startingHealthRollUpDone: false,
		},
	],
	fighters: [
		{
			currentState: 'idle',
			animationFrame: 2,
			direction: 1,
			position: { x: 100, y: 218 },
			hurtShake: 0,
		},
		{
			currentState: 'crouch',
			animationFrame: 0,
			direction: -1,
			position: { x: 300, y: 218 },
			hurtShake: 3,
		},
	],
	entities: new EntityList(),
});

const makeGameState = () => ({
	fighters: [
		{ hitPoints: 90, score: 100 },
		{ hitPoints: 42, score: 300 },
	],
});

test('serializeBattleState: 그리기 최소 동적 필드 매핑(와이어 포맷)', () => {
	const snap = serializeBattleState(makeScene(), makeGameState(), 7);
	assert.equal(snap.t, 'state');
	assert.equal(snap.f, 7);
	assert.deepEqual(snap.cam, { x: 11, y: 3 });
	assert.deepEqual(snap.ord, [0, 1]);
	assert.equal(snap.win, -1); // winner undefined → -1
	assert.equal(snap.tm, 87);
	assert.deepEqual(snap.ft[0], {
		s: 'idle',
		af: 2,
		d: 1,
		x: 100,
		y: 218,
		hs: 0,
	});
	assert.deepEqual(snap.ft[1], {
		s: 'crouch',
		af: 0,
		d: -1,
		x: 300,
		y: 218,
		hs: 3,
	});
	assert.deepEqual(snap.gs, [
		{ hp: 90, sc: 100 },
		{ hp: 42, sc: 300 },
	]);
	assert.deepEqual(snap.ent, []);
});

test('serialize/apply 왕복: 게스트 씬이 호스트 상태로 덮어써진다', () => {
	const scene = makeScene();
	const gameState = makeGameState();
	const snap = serializeBattleState(scene, gameState, 0);

	const guestScene = makeScene();
	const guestGameState = makeGameState();
	guestScene.camera.position.x = -999;
	guestScene.fighters[0].position.x = -999;
	applyBattleState(guestScene, guestGameState, snap);

	assert.deepEqual(guestScene.camera.position, { x: 11, y: 3 });
	assert.deepEqual(guestScene.FighterDrawOrder, [0, 1]);
	assert.equal(guestScene.winnerId, undefined); // -1 → undefined
	assert.equal(guestScene.overlays[0].time, 87);
	assert.equal(guestScene.fighters[0].currentState, 'idle');
	assert.equal(guestScene.fighters[0].position.x, 100);
	assert.equal(guestScene.fighters[1].hurtShake, 3);
	assert.equal(guestGameState.fighters[1].hitPoints, 42);
	assert.equal(guestGameState.fighters[1].score, 300);
});

test('applyBattleState: 체력바 롤업 생략 — 표시값을 스냅샷 체력으로 직접 세팅', () => {
	const snap = serializeBattleState(makeScene(), makeGameState(), 0);
	const guestScene = makeScene();
	applyBattleState(guestScene, makeGameState(), snap);
	assert.equal(guestScene.overlays[0].startingHealthRollUpDone, true);
	assert.equal(guestScene.overlays[0].healthBars[0].hitPoints, 90);
	assert.equal(guestScene.overlays[0].healthBars[1].hitPoints, 42);
});

test('applyBattleState: 승자 매핑 — win>=0은 그대로, -1은 undefined', () => {
	const scene = makeScene();
	scene.winnerId = 1;
	const snap = serializeBattleState(scene, makeGameState(), 0);
	const guestScene = makeScene();
	applyBattleState(guestScene, makeGameState(), snap);
	assert.equal(guestScene.winnerId, 1);
});

test('applyBattleState: tm이 null이면 타이머를 건드리지 않는다', () => {
	const snap = serializeBattleState(makeScene(), makeGameState(), 0);
	snap.tm = null;
	const guestScene = makeScene();
	guestScene.overlays[0].time = 55;
	applyBattleState(guestScene, makeGameState(), snap);
	assert.equal(guestScene.overlays[0].time, 55);
});

// ── EntityCodec: 파동권·히트 스플래시 reconcile ──────────────────────────

const fighterStub = { direction: -1, position: { x: 300, y: 218 } };
const timeStub = { previous: 100 };

test('Fireball 직렬화: k=fb, 강도·상태·좌표 포함, netId는 안정', () => {
	const scene = makeScene();
	scene.entities.add(Fireball, fighterStub, FighterAttackStrength.HEAVY, timeStub);
	const [desc1, desc2] = [
		...serializeEntities(scene),
		...serializeEntities(scene),
	].slice(0, 2);
	assert.equal(desc1.k, 'fb');
	assert.equal(desc1.sr, FighterAttackStrength.HEAVY);
	assert.equal(desc1.d, -1);
	assert.equal(desc1.id, desc2.id); // 같은 엔티티 → 같은 netId
});

test('엔티티 왕복: 게스트 씬에 인스턴스가 생성되고 필드가 일치한다', () => {
	const hostScene = makeScene();
	hostScene.entities.add(Fireball, fighterStub, FighterAttackStrength.MEDIUM, timeStub);
	hostScene.entities.add(LightHitSplash, 150, 100, 1);
	const descs = serializeEntities(hostScene);

	const guestScene = makeScene();
	applyEntities(guestScene, descs);
	assert.equal(guestScene.entities.entitiesList.length, 2);

	const fb = guestScene.entities.entitiesList.find((e) => e instanceof Fireball);
	assert.ok(fb);
	assert.equal(fb.strength, FighterAttackStrength.MEDIUM);
	assert.equal(fb.direction, -1);
	assert.equal(fb.position.x, hostScene.entities.entitiesList[0].position.x);
	assert.equal(fb.currentState, hostScene.entities.entitiesList[0].currentState);

	const splash = guestScene.entities.entitiesList.find(
		(e) => e instanceof LightHitSplash
	);
	assert.ok(splash);
	assert.equal(splash.playerId, 1);
	assert.equal(splash.position.x, 150);
	assert.equal(splash.position.y, 100);
});

test('reconcile: 갱신은 같은 인스턴스를 제자리 수정, 소멸은 제거한다', () => {
	const hostScene = makeScene();
	hostScene.entities.add(Fireball, fighterStub, FighterAttackStrength.LIGHT, timeStub);
	const guestScene = makeScene();

	applyEntities(guestScene, serializeEntities(hostScene));
	const created = guestScene.entities.entitiesList[0];
	assert.ok(created instanceof Fireball);

	// 호스트에서 이동 → 게스트도 같은 인스턴스가 제자리 갱신(재생성 아님)
	hostScene.entities.entitiesList[0].position.x = 424.5;
	applyEntities(guestScene, serializeEntities(hostScene));
	assert.equal(guestScene.entities.entitiesList.length, 1);
	assert.equal(guestScene.entities.entitiesList[0], created);
	assert.equal(created.position.x, 424.5);

	// 호스트에서 소멸 → 게스트에서도 제거
	hostScene.entities.remove(hostScene.entities.entitiesList[0]);
	applyEntities(guestScene, serializeEntities(hostScene));
	assert.equal(guestScene.entities.entitiesList.length, 0);
});

test('reconcile: 알 수 없는 종류(k)는 조용히 건너뛴다', () => {
	const scene = makeScene();
	applyEntities(scene, [{ id: 99, k: 'unknown-thing', x: 1, y: 2 }]);
	assert.equal(scene.entities.entitiesList.length, 0);
	// 이후 빈 스냅샷 적용도 안전(제거 경합 없음)
	applyEntities(scene, []);
	assert.equal(scene.entities.entitiesList.length, 0);
});

test('serializeEntity: HitSplash 계열은 강도별 k=hs로 직렬화된다', () => {
	const scene = makeScene();
	scene.entities.add(LightHitSplash, 10, 20, 0);
	const [desc] = serializeEntities(scene);
	assert.equal(desc.k, 'hs');
	assert.equal(desc.hk, FighterAttackStrength.LIGHT);
	assert.equal(desc.pid, 0);
});
