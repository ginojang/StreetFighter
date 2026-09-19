import { test } from 'node:test';
import assert from 'node:assert/strict';

import { reproduce } from '../../scripts/repro_hurt_lockup.mjs';

/**
 * 히트 등록 잠금 버그 — 수정 적용 후 회귀 테스트.
 *
 * 수정(Fighter.js):
 *  1. handleAttackInit가 attackStruck를 재무장한다 — 공중 피격(jumpUp → HURT
 *     거부)으로 소비된 플래그가 다음 공격 시작 시 해제되어, 피격자가 IDLE을
 *     우회해도 새 공격은 정상 등록된다.
 *  2. updateAttackBoxCollided 루프의 미겹침 return → continue — HEAD가 아닌
 *     BODY/LEGS만 겹치는 공격도 등록된다.
 *
 * 참고: 공중 피격 자체의 HURT 거부(데미지는 들어가고 전이는 거부)는 상태
 * 데이터의 설계 그대로 유지된다 — 잠금 없이 데미지만 들어간다.
 */
test('공중 히트 거부 후에도 다음 공격은 히트를 등록한다 (attackStruck 재무장)', () => {
	const r = reproduce();

	// Phase 1 — 공중 피격: 데미지는 들어가고 전이는 여전히 거부(설계 그대로)
	assert.equal(r.struckInAir, true, '공중에서 onAttackHit 호출(데미지 적용)');
	assert.equal(r.hitsDuringAirHit, true, '히트 카운터 1');
	assert.equal(r.illegalMoveLogged, true, 'Illegal move 로그: ' + r.illegal.join('; '));
	assert.equal(r.bStillAirborne, true, '피격자는 여전히 점프 상태');
	assert.equal(r.attackStruckAfterAirHit, true, '거부 직후 플래그는 소비됨(다음 공격 init에서 재무장)');

	// Phase 2 — 잠금 소멸: 피격자가 IDLE을 우회해도 새 공격마다 등록된다
	assert.ok(r.locked1 >= 1, '중공격 등록(수정 전 0건 잠금)');
	assert.ok(r.locked2 >= 1, '강킥 등록(수정 전 0건 잠금)');

	// Phase 3 — IDLE 경유 해제(jugaad)와 재등록도 여전히 동작
	assert.equal(r.bReachedIdle, true, '피격자 IDLE 도달');
	assert.equal(r.attackStruckReleased, true, 'handleIdleInit로 해제 유지');
	assert.ok(r.recovered >= 1, '같은 공격이 다시 등록됨');

	// Phase 4 — BODY만 겹치는 공격도 등록(return→continue)
	assert.equal(r.rOnlyBody, true, '배치 사각형은 BODY와만 겹침');
	assert.ok(r.bodyOnlyHits >= 1, 'BODY-only 히트 등록(수정 전 영구 미스)');
	assert.equal(r.headControlHits, 1, 'HEAD 겹침(대조)은 1회 등록 — 중복 히트 없음');
});
