import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	MessageType,
	PROTOCOL_VERSION,
	inputMessage,
	helloMessage,
	pingMessage,
	pongMessage,
	encode,
	decode,
} from '../../src/net/protocol.js';

test('encode/decode 왕복: 객체가 JSON 문자열을 거쳐 보존된다', () => {
	const msg = inputMessage(42, 0b101);
	const round = decode(encode(msg));
	assert.deepEqual(round, { t: 'input', f: 42, b: 0b101 });
});

test('메시지 팩토리: 타입 태그와 필드 형태', () => {
	assert.equal(inputMessage(1, 2).t, MessageType.INPUT);
	assert.equal(helloMessage('host').t, MessageType.HELLO);
	assert.equal(helloMessage('guest').v, PROTOCOL_VERSION);
	assert.equal(pingMessage(123).t, MessageType.PING);
	assert.equal(pongMessage(123).t, MessageType.PONG);
	// PONG은 sentAt을 그대로 에코해야 RTT 계산이 성립
	assert.equal(pongMessage(987).s, 987);
});

test('MessageType: 프로토콜 태그 문자열 고정(와이어 호환)', () => {
	assert.deepEqual(MessageType, {
		HELLO: 'hello',
		INPUT: 'input',
		STATE: 'state',
		PING: 'ping',
		PONG: 'pong',
	});
});

test('decode: 손상된 JSON은 예외를 던진다(수신측에서 폐기 계약)', () => {
	assert.throws(() => decode('not json{'));
	assert.throws(() => decode(''));
});

test('encode: 문자열 반환(전송 계약 — 문자열 또는 ArrayBuffer)', () => {
	assert.equal(typeof encode(inputMessage(0, 0)), 'string');
});
