import { MessageType } from './protocol.js';
import { serializeEntities, applyEntities } from './EntityCodec.js';

/**
 * 배틀 상태 스냅샷 코덱 (Phase 1 상태 스트리밍).
 *
 * 호스트-권위 모델에서 시뮬은 호스트에서만 돈다. 게스트는 한 프레임을 "그리는 데
 * 필요한 최소 상태"만 받아 자기 인스턴스에 덮어쓰고 기존 draw()를 그대로 호출한다.
 *
 * 스프라이트 시트·애니메이션 맵·프레임 좌표 같은 정적 데이터는 게스트도 이미
 * 동일하게 가지고 있으므로, 매 프레임 보내는 것은 아래 "동적 필드"뿐이다:
 *   - 파이터: 상태(s), 애니 프레임(af), 방향(d), 위치(x,y), 피격 흔들림(hs)
 *   - 카메라: 위치(cam)
 *   - 상태바: 남은 시간(tm) + 각 파이터 체력(hp)/점수(sc)
 *   - 엔티티(ent): 파동권·히트 스플래시 (Phase 1b, EntityCodec 참조)
 *   - 메타: 그리기 순서(ord), 승자(win)
 *
 * 필드명은 와이어 포맷이므로 짧게 유지하고 재배열하지 않는다.
 * (현재 JSON. 나중에 델타/바이너리 압축 여지 있음 — protocol.encode 단일 지점)
 */

const findStatusBar = (scene) =>
	scene.overlays?.find((overlay) => 'time' in overlay);

/**
 * 호스트: 현재 배틀 씬 + gameState를 스냅샷으로 직렬화.
 * @param {Object} scene BattleScene (fighters, camera, FighterDrawOrder, winnerId, overlays)
 * @param {Object} gameState { fighters: [{ hitPoints, score }, ...] }
 * @param {number} frame 프레임 번호 (순서 뒤바뀐 스냅샷 폐기용)
 */
export const serializeBattleState = (scene, gameState, frame = 0) => {
	const statusBar = findStatusBar(scene);
	return {
		t: MessageType.STATE,
		f: frame,
		cam: { x: scene.camera.position.x, y: scene.camera.position.y },
		ord: scene.FighterDrawOrder.slice(),
		win: scene.winnerId ?? -1,
		tm: statusBar ? statusBar.time : null,
		ft: scene.fighters.map((fighter) => ({
			s: fighter.currentState,
			af: fighter.animationFrame,
			d: fighter.direction,
			x: fighter.position.x,
			y: fighter.position.y,
			hs: fighter.hurtShake ?? 0,
		})),
		gs: gameState.fighters.map((fighter) => ({
			hp: fighter.hitPoints,
			sc: fighter.score,
		})),
		ent: serializeEntities(scene),
	};
};

/**
 * 게스트: 받은 스냅샷을 로컬 씬 인스턴스에 적용. 이후 scene.draw()가 그대로 동작.
 * (시뮬 업데이트는 절대 호출하지 않는다 — 그리기만.)
 */
export const applyBattleState = (scene, gameState, snap) => {
	scene.camera.position.x = snap.cam.x;
	scene.camera.position.y = snap.cam.y;
	scene.FighterDrawOrder = snap.ord.slice();
	scene.winnerId = snap.win === -1 ? undefined : snap.win;

	const statusBar = findStatusBar(scene);
	if (statusBar) {
		if (snap.tm !== null) statusBar.time = snap.tm;
		// 게스트는 시뮬을 안 돌려 체력바 롤업 애니가 갱신되지 않으므로, 표시값을
		// 스냅샷 체력으로 직접 맞춘다(애니는 생략하되 값은 정확).
		if (statusBar.healthBars) {
			statusBar.startingHealthRollUpDone = true;
			snap.gs.forEach((g, index) => {
				if (statusBar.healthBars[index]) {
					statusBar.healthBars[index].hitPoints = g.hp;
				}
			});
		}
	}

	snap.ft.forEach((f, index) => {
		const fighter = scene.fighters[index];
		if (!fighter) return;
		fighter.currentState = f.s;
		fighter.animationFrame = f.af;
		fighter.direction = f.d;
		fighter.position.x = f.x;
		fighter.position.y = f.y;
		fighter.hurtShake = f.hs;
	});

	snap.gs.forEach((g, index) => {
		if (!gameState.fighters[index]) return;
		gameState.fighters[index].hitPoints = g.hp;
		gameState.fighters[index].score = g.sc;
	});

	// 파동권·히트 스플래시 등 동적 엔티티 조정 반영.
	applyEntities(scene, snap.ent ?? []);
};
