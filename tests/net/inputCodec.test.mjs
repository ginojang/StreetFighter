import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	CONTROL_ORDER,
	CONTROL_BIT,
	encodeControls,
	decodeControls,
	isControlSet,
} from '../../src/net/InputCodec.js';
import { Control } from '../../src/constants/controls.js';

test('CONTROL_ORDER: 컨트롤 10개가 정의된 순서 그대로', () => {
	assert.equal(CONTROL_ORDER.length, 10);
	assert.deepEqual(CONTROL_ORDER, [
		Control.LEFT,
		Control.RIGHT,
		Control.UP,
		Control.DOWN,
		Control.LIGHT_PUNCH,
		Control.MEDIUM_PUNCH,
		Control.HEAVY_PUNCH,
		Control.LIGHT_KICK,
		Control.MEDIUM_KICK,
		Control.HEAVY_KICK,
	]);
});

test('와이어 포맷 고정(재배열 금지): 비트 위치가 정확히 bit0..bit9', () => {
	// 이 값들은 네트워크 와이어 포맷이다 — 바뀌면 피어 간 호환성이 깨진다.
	const expectedBits = [
		0b0000000001,
		0b0000000010,
		0b0000000100,
		0b0000001000,
		0b0000010000,
		0b0000100000,
		0b0001000000,
		0b0010000000,
		0b0100000000,
		0b1000000000,
	];
	CONTROL_ORDER.forEach((control, index) => {
		assert.equal(CONTROL_BIT[control], expectedBits[index], `${control} 비트 위치 고정`);
	});
});

test('encodeControls: 눌린 컨트롤만 비트로', () => {
	assert.equal(encodeControls({}), 0);
	assert.equal(
		encodeControls({ [Control.LEFT]: true, [Control.HEAVY_KICK]: true }),
		CONTROL_BIT[Control.LEFT] | CONTROL_BIT[Control.HEAVY_KICK]
	);
	// false는 명시돼도 미포함
	assert.equal(encodeControls({ [Control.UP]: false }), 0);
	// 모든 컨트롤 동시 → 하위 10비트 전부
	assert.equal(encodeControls(Object.fromEntries(CONTROL_ORDER.map((c) => [c, true]))), 0b1111111111);
});

test('decodeControls: 모든 컨트롤 키를 가진 상태 객체로', () => {
	const state = decodeControls(CONTROL_BIT[Control.RIGHT] | CONTROL_BIT[Control.LIGHT_PUNCH]);
	assert.equal(Object.keys(state).length, 10);
	assert.equal(state[Control.RIGHT], true);
	assert.equal(state[Control.LIGHT_PUNCH], true);
	assert.equal(state[Control.LEFT], false);
	assert.equal(decodeControls(0)[Control.UP], false);
});

test('encode/decode 왕복: 임의 마스크가 보존된다', () => {
	for (const bits of [0, 1, 0b101, 0b1111111111, 0b1000000001]) {
		assert.equal(encodeControls(decodeControls(bits)), bits);
	}
});

test('isControlSet: 특정 비트 질의', () => {
	const bits = CONTROL_BIT[Control.DOWN] | CONTROL_BIT[Control.MEDIUM_KICK];
	assert.equal(isControlSet(bits, Control.DOWN), true);
	assert.equal(isControlSet(bits, Control.MEDIUM_KICK), true);
	assert.equal(isControlSet(bits, Control.UP), false);
	assert.equal(isControlSet(0, Control.UP), false);
});
