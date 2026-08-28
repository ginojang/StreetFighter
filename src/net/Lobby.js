import { SignalingClient } from './SignalingClient.js';
import { createMatchmadeConnection } from './WebRTCConnection.js';
import { NetSession, NetRole } from './NetSession.js';
import { BattleScene } from '../scenes/BattleScene.js';
import { readLocalInputBits, applyRemoteInput } from '../engine/InputHandler.js';

/**
 * 온라인 대전 로비 (HTML 오버레이).
 *
 * URL을 직접 만지지 않고도 방을 만들거나(host) 코드로 참가(guest)할 수 있게 하는
 * 최소 UI. 실제 연결/역할 배정은 이미 검증된 하위 계층에 위임한다:
 *   SignalingClient(intent) → createMatchmadeConnection → NetSession.
 * 오버레이는 캔버스 위에 얹히며, 매치가 실제로 연결(DataChannel open)되면 사라지고
 * 양쪽이 배틀 씬으로 진입한다. ?net=lobby 일 때만 열리므로 로컬 플레이엔 영향 없음.
 *
 * 이 파일에서 DOM/도큐먼트는 openLobby() 호출 시점에만 참조된다(순수 헬퍼는 예외 없음)
 * → import 자체는 node에서 안전. 순수 헬퍼(코드 정규화·기본 URL·초대 링크)는 분리 테스트.
 */

// 숫자 전용. 알파벳 코드는 게임 이동/공격키(WASD+QERFVG)와 겹쳐, 전역 keydown
// 핸들러가 그 키를 가로채면 로비 입력창에 글자가 안 찍히는 문제가 있었다 → 숫자만 사용.
const CODE_ALPHABET = '0123456789';
const realIo = { readLocalInputBits, applyRemoteInput };

// ── 순수 헬퍼 (DOM 불필요, 단위 테스트 대상) ──────────────────────────────

export const randomRoomCode = () => {
	let code = '';
	for (let i = 0; i < 4; i++) {
		code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
	}
	return code;
};

/** 입력을 방 코드 형식으로 정규화: 숫자만, 4자리. (알파벳은 게임 조작키와 겹쳐 제외.) */
export const normalizeRoomCode = (input) =>
	(input || '').replace(/[^0-9]/g, '').slice(0, 4);

/**
 * 현재 위치에서 합리적인 시그널링 기본 URL 추정.
 *   https → `wss://<host>/street_fighter/signal` : 배포 환경. nginx가 이 경로의
 *           WebSocket 업그레이드를 로컬 시그널링 서버(127.0.0.1:8080)로 프록시한다.
 *   http  → `ws://<host>:8080` : 로컬 개발(두 탭). 시그널링 서버에 직접 접속.
 */
export const defaultSignalUrl = (loc) => {
	const secure = loc?.protocol === 'https:';
	const host = loc?.hostname || 'localhost';
	return secure ? `wss://${host}/street_fighter/signal` : `ws://${host}:8080`;
};

/** 게스트가 눌러 바로 참가할 수 있는 초대 링크. */
export const buildJoinLink = (loc, room, signalUrl) => {
	const base = `${loc.origin}${loc.pathname}`;
	const params = new URLSearchParams({ net: 'lobby', room });
	if (signalUrl) params.set('signal', signalUrl);
	return `${base}?${params.toString()}`;
};

/**
 * 기본 ICE 설정에 사용자가 입력한 TURN 중계를 합친다(있을 때만).
 * TURN 자격증명은 런타임 입력값일 뿐 — 저장소엔 절대 남기지 않는다.
 */
export const mergeTurn = (rtcConfig, turn) => {
	const iceServers = [...(rtcConfig?.iceServers ?? [])];
	if (turn && turn.url) {
		iceServers.push({
			urls: turn.url,
			username: turn.username || '',
			credential: turn.credential || '',
		});
	}
	return { ...(rtcConfig || {}), iceServers };
};

/** 실패 사유 → 사용자 안내(직접 연결 실패는 TURN을 권한다). */
export const failText = (reason) =>
	({
		timeout:
			'연결 시간 초과 — 상대와 직접 연결이 안 됩니다. 아래 고급 설정에서 TURN 서버를 지정해 보세요.',
		'ice-failed':
			'연결 실패(NAT/방화벽) — 고급 설정에서 TURN 서버를 지정해 보세요.',
		'connection-failed':
			'연결이 끊겼습니다 — 고급 설정에서 TURN 서버를 지정해 보세요.',
	})[reason] || `연결 실패: ${reason}`;

// ── 오버레이 ─────────────────────────────────────────────────────────────

const STYLE_ID = 'sfnp-style';
const STYLE = `
.sfnp-backdrop{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
	background:rgba(0,0,0,.78);z-index:9999;font-family:"Courier New",monospace;color:#fff;}
.sfnp-card{position:relative;width:min(92vw,360px);background:#14110c;border:2px solid #ffcf1b;
	box-shadow:0 0 0 4px #000,0 12px 40px rgba(0,0,0,.6);padding:22px 20px 20px;image-rendering:pixelated;}
.sfnp-title{margin:0 0 14px;font-size:20px;font-weight:800;letter-spacing:3px;text-align:center;
	color:#ffcf1b;text-shadow:2px 2px 0 #b3400d;text-transform:uppercase;}
.sfnp-sub{font-size:11px;line-height:1.5;color:#c9c2b4;text-align:center;margin:0 0 16px;}
.sfnp-row{display:flex;flex-direction:column;gap:10px;}
.sfnp-btn{font:inherit;font-weight:800;letter-spacing:2px;text-transform:uppercase;cursor:pointer;
	padding:12px;border:2px solid #ffcf1b;background:#1d1810;color:#ffcf1b;transition:all .1s;}
.sfnp-btn:hover{background:#ffcf1b;color:#14110c;}
.sfnp-btn.sfnp-secondary{border-color:#7a726040;color:#c9c2b4;}
.sfnp-btn.sfnp-secondary:hover{background:#2a2418;color:#fff;}
.sfnp-field{font:inherit;padding:10px;background:#0c0a07;border:2px solid #4a4536;color:#fff;width:100%;}
.sfnp-field:focus{outline:none;border-color:#ffcf1b;}
.sfnp-label{font-size:10px;letter-spacing:1px;color:#8a8271;text-transform:uppercase;margin-bottom:4px;display:block;}
.sfnp-code{font-size:40px;font-weight:800;letter-spacing:12px;text-align:center;color:#ffcf1b;
	text-shadow:2px 2px 0 #b3400d;padding:12px 0 6px;padding-left:12px;}
.sfnp-code-input{font-size:28px;font-weight:800;letter-spacing:10px;text-align:center;text-transform:uppercase;padding-left:10px;}
.sfnp-status{font-size:12px;text-align:center;margin-top:14px;min-height:16px;color:#c9c2b4;}
.sfnp-status.sfnp-err{color:#ff6b5e;}
.sfnp-close{position:absolute;top:6px;right:10px;cursor:pointer;color:#8a8271;font-size:18px;font-weight:800;
	background:none;border:none;}
.sfnp-close:hover{color:#fff;}
.sfnp-mt{margin-top:10px;}
.sfnp-dim{color:#8a8271;font-size:10px;text-align:center;margin-top:12px;letter-spacing:1px;}
.sfnp-adv{margin-top:4px;border-top:1px solid #2a2418;padding-top:6px;}
.sfnp-adv summary{cursor:pointer;font-size:10px;letter-spacing:1px;color:#8a8271;text-transform:uppercase;padding:6px 0;list-style:none;}
.sfnp-adv summary:hover{color:#c9c2b4;}
.sfnp-adv summary::-webkit-details-marker{display:none;}
`;

const injectStyle = () => {
	if (document.getElementById(STYLE_ID)) return;
	const style = document.createElement('style');
	style.id = STYLE_ID;
	style.textContent = STYLE;
	document.head.appendChild(style);
};

const el = (tag, props = {}, children = []) => {
	const node = document.createElement(tag);
	for (const [key, value] of Object.entries(props)) {
		if (key === 'class') node.className = value;
		else if (key === 'text') node.textContent = value;
		else if (key.startsWith('on') && typeof value === 'function') {
			node.addEventListener(key.slice(2).toLowerCase(), value);
		} else node.setAttribute(key, value);
	}
	for (const child of [].concat(children)) {
		if (child) node.appendChild(child);
	}
	return node;
};

/**
 * 로비 오버레이를 연다.
 * @param {Object} game StreetFighterGame
 * @param {Object} opts
 * @param {string} opts.signalUrl 시그널링 기본 URL(입력 필드 초기값)
 * @param {Object} opts.rtcConfig ICE 설정
 * @param {string} [opts.prefillRoom] 참가 코드 미리 채우기(초대 링크로 들어온 경우)
 */
export const openLobby = (game, { signalUrl, rtcConfig, prefillRoom } = {}) => {
	injectStyle();

	const card = el('div', { class: 'sfnp-card' });
	const backdrop = el('div', { class: 'sfnp-backdrop' }, [card]);
	let active = null; // { signaling, connection } — 정리용

	const teardown = () => {
		try {
			active?.connection?.close();
		} catch {
			/* noop */
		}
		try {
			active?.signaling?.close();
		} catch {
			/* noop */
		}
		active = null;
	};

	const closeOverlay = () => {
		backdrop.remove();
	};

	const render = (children) => {
		card.innerHTML = '';
		const close = el('button', {
			class: 'sfnp-close',
			text: '×',
			title: '닫기',
			onclick: () => {
				teardown();
				closeOverlay();
			},
		});
		card.appendChild(close);
		for (const child of [].concat(children)) card.appendChild(child);
	};

	// 매치 성립: 역할별로 세션을 걸고, 실제 연결되면 오버레이를 닫고 배틀 진입.
	const wire = (connection, role) => {
		if (role === 'host') {
			game.mode = 'host';
			game.netSession = new NetSession({
				role: NetRole.HOST,
				connection,
				io: realIo,
				remotePlayerId: 1,
			});
		} else {
			game.mode = 'guest';
			game.netSession = new NetSession({
				role: NetRole.GUEST,
				connection,
				io: realIo,
				localPlayerIndex: 0,
			});
		}
		connection.onOpen(() => {
			game.startScene(BattleScene); // 양쪽 동시에 새 배틀 시작
			closeOverlay();
		});
	};

	const signalField = el('input', {
		class: 'sfnp-field',
		value: signalUrl || '',
		placeholder: 'ws://호스트:8080',
	});

	const currentSignal = () => signalField.value.trim();

	// 고급: TURN 중계 (대칭형 NAT 등 직접 연결 실패 시). 값은 런타임 전용, 커밋 금지.
	const turnUrlField = el('input', {
		class: 'sfnp-field',
		placeholder: 'turn:호스트:3478',
	});
	const turnUserField = el('input', { class: 'sfnp-field', placeholder: 'username' });
	const turnCredField = el('input', {
		class: 'sfnp-field',
		type: 'password',
		placeholder: 'credential',
	});
	const currentRtcConfig = () =>
		mergeTurn(rtcConfig, {
			url: turnUrlField.value.trim(),
			username: turnUserField.value.trim(),
			credential: turnCredField.value.trim(),
		});
	const advancedSection = () =>
		el('details', { class: 'sfnp-adv' }, [
			el('summary', { text: '고급: TURN 중계 (연결 안 될 때)' }),
			el('div', { class: 'sfnp-mt' }, [
				el('span', { class: 'sfnp-label', text: 'TURN URL' }),
				turnUrlField,
			]),
			el('div', { class: 'sfnp-mt' }, [
				el('span', { class: 'sfnp-label', text: 'TURN 사용자/자격증명' }),
				turnUserField,
				el('div', { class: 'sfnp-mt' }, [turnCredField]),
			]),
			el('p', {
				class: 'sfnp-dim',
				text: '자격증명은 이 브라우저에만 쓰입니다 (저장·전송 안 함).',
			}),
		]);

	// ── 뷰: 메뉴 ──
	const showMenu = () => {
		teardown();
		render([
			el('h1', { class: 'sfnp-title', text: 'Online 대전' }),
			el('p', {
				class: 'sfnp-sub',
				text: '한 명이 방을 만들고 코드를 공유하면, 다른 한 명이 그 코드로 참가합니다.',
			}),
			el('div', { class: 'sfnp-row' }, [
				el('div', {}, [
					el('span', { class: 'sfnp-label', text: '시그널링 서버' }),
					signalField,
				]),
				el('button', {
					class: 'sfnp-btn',
					text: '방 만들기',
					onclick: onCreate,
				}),
				el('button', {
					class: 'sfnp-btn sfnp-secondary',
					text: '코드로 참가',
					onclick: showJoin,
				}),
				advancedSection(),
			]),
			el('p', {
				class: 'sfnp-dim',
				text: 'P1(왼쪽)=방장 · P2(오른쪽)=참가자 · WASD+QERFVG',
			}),
		]);
	};

	// ── 뷰: 방 만듦(대기) ──
	const showCreated = (room, statusNode) => {
		const link = buildJoinLink(location, room, currentSignal());
		const copyBtn = el('button', {
			class: 'sfnp-btn sfnp-secondary sfnp-mt',
			text: '초대 링크 복사',
			onclick: () => {
				try {
					navigator.clipboard?.writeText(link);
					copyBtn.textContent = '복사됨!';
				} catch {
					copyBtn.textContent = link;
				}
			},
		});
		render([
			el('h1', { class: 'sfnp-title', text: '방 코드' }),
			el('div', { class: 'sfnp-code', text: room }),
			el('p', { class: 'sfnp-sub', text: '이 코드를 상대에게 알려주세요.' }),
			copyBtn,
			statusNode,
			el('button', {
				class: 'sfnp-btn sfnp-secondary sfnp-mt',
				text: '취소',
				onclick: showMenu,
			}),
		]);
	};

	// ── 뷰: 참가(코드 입력) ──
	const showJoin = () => {
		teardown();
		const codeInput = el('input', {
			class: 'sfnp-field sfnp-code-input',
			maxlength: '4',
			inputmode: 'numeric',
			placeholder: '0000',
			value: normalizeRoomCode(prefillRoom),
		});
		codeInput.addEventListener('input', () => {
			codeInput.value = normalizeRoomCode(codeInput.value);
		});
		const status = el('div', { class: 'sfnp-status' });
		render([
			el('h1', { class: 'sfnp-title', text: '방 참가' }),
			el('div', {}, [
				el('span', { class: 'sfnp-label', text: '방 코드' }),
				codeInput,
			]),
			el('button', {
				class: 'sfnp-btn sfnp-mt',
				text: '연결',
				onclick: () => onJoin(normalizeRoomCode(codeInput.value), status),
			}),
			status,
			el('button', {
				class: 'sfnp-btn sfnp-secondary sfnp-mt',
				text: '뒤로',
				onclick: showMenu,
			}),
		]);
		codeInput.focus?.();
	};

	const errorText = (reason) =>
		({
			'room-not-found': '그런 방이 없습니다. 코드를 확인하세요.',
			'room-full': '방이 이미 꽉 찼습니다.',
			'room-exists': '같은 코드의 방이 이미 있습니다. 다시 시도하세요.',
			'role-taken': '역할이 이미 찼습니다.',
		})[reason] || `연결 실패: ${reason}`;

	// ── 액션: 방 만들기 ──
	function onCreate() {
		const url = currentSignal();
		if (!url) return showMenu();
		const room = randomRoomCode();
		const status = el('div', { class: 'sfnp-status', text: '상대를 기다리는 중…' });
		showCreated(room, status);

		const signaling = new SignalingClient({ url, room, intent: 'create' });
		createMatchmadeConnection({ signaling, rtcConfig: currentRtcConfig() })
			.then(({ connection, role }) => {
				active = { signaling, connection };
				wire(connection, role); // host — onOpen에서 오버레이 닫힘
				connection.onFail((reason) => {
					status.className = 'sfnp-status sfnp-err';
					status.textContent = failText(reason);
				});
			})
			.catch((err) => {
				status.className = 'sfnp-status sfnp-err';
				status.textContent = errorText(err.message);
			});
	}

	// ── 액션: 참가 ──
	function onJoin(room, status) {
		const url = currentSignal();
		if (!url) {
			status.className = 'sfnp-status sfnp-err';
			status.textContent = '시그널링 서버 주소가 필요합니다.';
			return;
		}
		if (room.length < 1) {
			status.className = 'sfnp-status sfnp-err';
			status.textContent = '방 코드를 입력하세요.';
			return;
		}
		status.className = 'sfnp-status';
		status.textContent = '연결 중…';

		const signaling = new SignalingClient({ url, room, intent: 'join' });
		createMatchmadeConnection({ signaling, rtcConfig: currentRtcConfig() })
			.then(({ connection, role }) => {
				active = { signaling, connection };
				wire(connection, role); // guest — onOpen에서 오버레이 닫힘
				connection.onFail((reason) => {
					status.className = 'sfnp-status sfnp-err';
					status.textContent = failText(reason);
				});
			})
			.catch((err) => {
				status.className = 'sfnp-status sfnp-err';
				status.textContent = errorText(err.message);
			});
	}

	document.body.appendChild(backdrop);
	// 초대 링크로 코드가 주어졌으면 참가 화면부터.
	if (normalizeRoomCode(prefillRoom).length > 0) showJoin();
	else showMenu();

	return { close: () => {
		teardown();
		closeOverlay();
	} };
};
