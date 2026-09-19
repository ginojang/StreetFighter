import { test } from 'node:test';
import assert from 'node:assert/strict';

// 게임 모듈 import 전에 DOM 스톱 설치 (Lobby → BattleScene → fighters 사슬)
import { installDomStubs } from '../helpers/domStub.mjs';
installDomStubs();

const {
	randomRoomCode,
	normalizeRoomCode,
	defaultSignalUrl,
	buildJoinLink,
	mergeTurn,
	failText,
} = await import('../../src/net/Lobby.js');

test('randomRoomCode: 숫자 4자리 (알파벳은 게임 조작키와 겹쳐 금지)', () => {
	for (let i = 0; i < 50; i += 1) {
		assert.match(randomRoomCode(), /^[0-9]{4}$/);
	}
});

test('normalizeRoomCode: 숫자만 남기고 4자리로 자른다', () => {
	assert.equal(normalizeRoomCode('12a3b4'), '1234');
	assert.equal(normalizeRoomCode('12-34-56'), '1234');
	assert.equal(normalizeRoomCode('  9'), '9');
	assert.equal(normalizeRoomCode(''), '');
	assert.equal(normalizeRoomCode(undefined), '');
	assert.equal(normalizeRoomCode(null), '');
});

test('defaultSignalUrl: https → wss 프록시 경로, http → 직접 8080', () => {
	assert.equal(
		defaultSignalUrl({ protocol: 'https:', hostname: 'elda-ai.org' }),
		'wss://elda-ai.org/street_fighter/signal'
	);
	assert.equal(
		defaultSignalUrl({ protocol: 'http:', hostname: '192.168.0.10' }),
		'ws://192.168.0.10:8080'
	);
	// hostname 누락 → localhost 폴백
	assert.equal(defaultSignalUrl({ protocol: 'http:' }), 'ws://localhost:8080');
});

test('buildJoinLink: net=lobby + room (+ signal) 파라미터를 가진 초대 링크', () => {
	const link = buildJoinLink(
		{ origin: 'https://x.io', pathname: '/street_fighter/' },
		'1234',
		'ws://h:1'
	);
	assert.equal(
		link,
		'https://x.io/street_fighter/?net=lobby&room=1234&signal=ws%3A%2F%2Fh%3A1'
	);
	const noSignal = buildJoinLink(
		{ origin: 'http://localhost:8080', pathname: '/index.html' },
		'99',
		undefined
	);
	assert.equal(noSignal, 'http://localhost:8080/index.html?net=lobby&room=99');
});

test('mergeTurn: TURN을 iceServers 끝에 추가, 원본 config는 불변', () => {
	const base = { iceServers: [{ urls: 'stun:stun.example:19302' }] };
	const merged = mergeTurn(base, {
		url: 'turn:relay.example:3478',
		username: 'u',
		credential: 'c',
	});
	assert.equal(merged.iceServers.length, 2);
	assert.deepEqual(merged.iceServers[1], {
		urls: 'turn:relay.example:3478',
		username: 'u',
		credential: 'c',
	});
	// 원본 오염 없음
	assert.equal(base.iceServers.length, 1);
	// TURN 미입력 → 그대로
	const untouched = mergeTurn(base, { url: '', username: '', credential: '' });
	assert.equal(untouched.iceServers.length, 1);
});

test('failText: 알려진 실패 사유는 TURN 안내, 그 외에는 사유 포함', () => {
	assert.match(failText('timeout'), /TURN/);
	assert.match(failText('ice-failed'), /TURN/);
	assert.match(failText('connection-failed'), /TURN/);
	assert.match(failText('weird-reason'), /weird-reason/);
});
