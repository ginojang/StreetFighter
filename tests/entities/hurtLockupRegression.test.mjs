import { test } from 'node:test';
import assert from 'node:assert/strict';

import { reproduce } from '../../scripts/repro_hurt_lockup.mjs';

/**
 * 알려진 버그 캐너리 — (b)단계에서 규명한 히트 등록 잠금 버그.
 *
 * 근본 원인: Fighter.handleAttackHit이 changeState 가드 "이전에"
 * this.opponent.attackStruck = true 를 실행한다. 피격자가 공중(JUMP_UP 등,
 * FighterHurtStates에 없는 상태)이면 HURT 진입이 거부되는데 플래그는 이미
 * 소비됨 → 피격자가 IDLE을 거치지 않는 한 공격자의 모든 후속 공격이
 * updateAttackBoxCollided의 attackStruck early-return으로 미등록된다.
 *
 * ⚠ 이 테스트는 버그가 "현재 진단 그대로 존재"함을 고정한다(수정이 아직
 * 승인되지 않음). 수정 적용 시 기대값을 반전(잠금 소멸 방향)하고 이 주석을
 * 지울 것. 승인된 수정 후보: handleAttackInit에서 attackStruck 재무장,
 * updateAttackBoxCollided 루프의 return→continue, 경량 공격 핸들러 교차 배선.
 */
test('캐너리: 공중 히트 거부 → attackStruck 잠금이 재현된다 (버그 미수정 상태 고정)', () => {
	const r = reproduce();

	// Phase 1 — 공중 피격: 데미지는 들어가고 전이는 거부된다
	assert.equal(r.struckInAir, true, '공중에서 onAttackHit 호출(데미지 적용)');
	assert.equal(r.hitsDuringAirHit, true, '히트 카운터 1');
	assert.equal(r.illegalMoveLogged, true, 'Illegal move 로그: ' + r.illegal.join('; '));
	assert.equal(r.bStillAirborne, true, '피격자는 여전히 점프 상태');
	assert.equal(r.attackStruckAfterAirHit, true, '공격자 attackStruck 갇힘(근본 원인)');

	// Phase 2 — 잠금: 피격자가 IDLE을 우회하면 새 공격이 전부 무시된다
	assert.equal(r.bAvoidsIdle, true, '피격자 크라우치로 IDLE 우회');
	assert.equal(r.locked1, 0, '중공격 겹침에도 히트 0건');
	assert.equal(r.locked2, 0, '강킥 겹침에도 히트 0건');
	assert.equal(r.attackStruckStillTrue, true, 'attackStruck 여전히 true');

	// Phase 3 — 회복: 피격자가 IDLE을 거치면 즉시 해제(jugaad)
	assert.equal(r.bReachedIdle, true, '피격자 IDLE 도달');
	assert.equal(r.attackStruckReleased, true, 'handleIdleInit로 재무장');
	assert.ok(r.recovered >= 1, '같은 공격이 다시 등록됨');

	// Phase 4 — 별도 버그: BODY/LEGS만 겹치는 공격은 return(≠continue) 때문에 미등록
	assert.equal(r.rOnlyBody, true, '배치 사각형은 BODY와만 겹침');
	assert.equal(r.bodyOnlyHits, 0, 'BODY만 겹치면 미등록');
	assert.equal(r.headControlHits, 1, 'HEAD 겹침(대조)은 등록');
});
