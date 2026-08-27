import { Fireball } from '../entitites/fighters/special/Fireball.js';
import {
	LightHitSplash,
	MediumHitSplash,
	HeavyHitSplash,
} from '../entitites/fighters/shared/index.js';
import { FighterAttackStrength } from '../constants/fighter.js';

/**
 * 엔티티 스트리밍 코덱 (Phase 1b).
 *
 * 씬의 동적 엔티티(파동권 Fireball, 히트 스플래시 HitSplash)를 호스트가 직렬화하고
 * 게스트가 자기 씬에 재구성한다. 파이터와 달리 엔티티는 매치 도중 생성·소멸하므로
 * 호스트가 각 엔티티에 안정적인 netId를 붙이고, 게스트는 그 id로 조정(reconcile)한다:
 *   - 처음 보는 id  → 해당 클래스 인스턴스를 생성해 씬에 추가
 *   - 기존 id       → 동적 필드만 덮어씀
 *   - 사라진 id     → 씬에서 제거
 *
 * 스프라이트 시트/애니메이션/프레임 좌표는 게스트도 이미 클래스에 갖고 있으므로,
 * 인스턴스를 (스텁 인자로) 생성만 하면 정적 데이터가 채워진다. 그 위에 위치/상태/
 * 애니프레임만 스냅샷 값으로 덮어쓰면 기존 draw()가 그대로 그린다.
 *
 * 엔티티 클래스는 생성자 안에서만 document/이미지를 참조하므로 import 자체는 node에서 안전.
 */

// 호스트 전용 단조 증가 id 발급 (한 페이지에 호스트는 하나).
let entityNetIdCounter = 0;
const nextEntityNetId = () => ++entityNetIdCounter;

const hitSplashKind = (entity) => {
	if (entity instanceof HeavyHitSplash) return FighterAttackStrength.HEAVY;
	if (entity instanceof MediumHitSplash) return FighterAttackStrength.MEDIUM;
	return FighterAttackStrength.LIGHT;
};

const hitSplashClassFor = (kind) => {
	switch (kind) {
		case FighterAttackStrength.HEAVY:
			return HeavyHitSplash;
		case FighterAttackStrength.MEDIUM:
			return MediumHitSplash;
		default:
			return LightHitSplash;
	}
};

/** 호스트: 엔티티 하나를 와이어용 최소 서술로. (필드명은 와이어 포맷 — 짧게 유지) */
export const serializeEntity = (entity) => {
	if (entity instanceof Fireball) {
		entity._netId ??= nextEntityNetId();
		return {
			id: entity._netId,
			k: 'fb',
			st: entity.currentState,
			af: entity.animationFrame,
			d: entity.direction,
			x: entity.position.x,
			y: entity.position.y,
			sr: entity.strength,
		};
	}
	// 그 외는 HitSplash 계열
	entity._netId ??= nextEntityNetId();
	return {
		id: entity._netId,
		k: 'hs',
		hk: hitSplashKind(entity),
		pid: entity.playerId,
		af: entity.animationFrame,
		x: entity.position.x,
		y: entity.position.y,
	};
};

/** 호스트: 씬의 엔티티 목록 전체를 직렬화. */
export const serializeEntities = (scene) =>
	(scene.entities?.entitiesList ?? []).map(serializeEntity);

// 게스트: 스냅샷 서술로부터 인스턴스 생성. 생성자는 스텁 인자로 호출해 정적 데이터만
// 채우고(동적 필드는 곧바로 덮어씀), 게스트는 이 엔티티의 update()를 절대 부르지 않는다.
const createEntityInstance = (scene, desc) => {
	if (desc.k === 'fb') {
		const fighterStub = { direction: desc.d, position: { x: 0, y: 0 } };
		const timeStub = { previous: 0 };
		return new Fireball(
			fighterStub,
			desc.sr ?? FighterAttackStrength.LIGHT,
			timeStub,
			scene.entities
		);
	}
	if (desc.k === 'hs') {
		const Cls = hitSplashClassFor(desc.hk);
		return new Cls(desc.x, desc.y, desc.pid, scene.entities);
	}
	return null;
};

const updateEntityInstance = (entity, desc) => {
	if (desc.k === 'fb') {
		entity.currentState = desc.st;
		entity.animationFrame = desc.af;
		entity.direction = desc.d;
		entity.position.x = desc.x;
		entity.position.y = desc.y;
	} else {
		entity.animationFrame = desc.af;
		entity.playerId = desc.pid;
		entity.position.x = desc.x;
		entity.position.y = desc.y;
	}
};

/**
 * 게스트: 스냅샷의 엔티티 목록을 씬에 조정 반영. 게스트의 entitiesList는 오직 이
 * 함수만 건드린다(게스트는 scene.update를 안 돌리므로 경합 없음).
 */
export const applyEntities = (scene, descs = []) => {
	if (!scene.entities) return;
	if (!scene._netEntities) scene._netEntities = new Map();
	const tracked = scene._netEntities;
	const seen = new Set();

	for (const desc of descs) {
		seen.add(desc.id);
		let entity = tracked.get(desc.id);
		if (!entity) {
			entity = createEntityInstance(scene, desc);
			if (!entity) continue;
			entity._netId = desc.id;
			tracked.set(desc.id, entity);
			scene.entities.entitiesList.push(entity);
		}
		updateEntityInstance(entity, desc);
	}

	// 스냅샷에 없는(=사라진) 엔티티는 게스트 씬에서도 제거.
	for (const [id, entity] of tracked) {
		if (!seen.has(id)) {
			tracked.delete(id);
			scene.entities.remove(entity);
		}
	}
};
