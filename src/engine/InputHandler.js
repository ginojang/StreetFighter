import { CONTROLLER_DEADZONE, controls } from '../config/controls.js';
import { Control } from '../constants/controls.js';
import { FighterDirection } from '../constants/fighter.js';
import { CONTROL_ORDER, encodeControls, isControlSet } from '../net/InputCodec.js';

const mappedButtons = new Set(
	controls.map(({ gamepad }) => Object.values(gamepad)).flat()
);
const heldGamepadButtons = [new Set(), new Set()];
const pressedGamepadButtons = [new Set(), new Set()];

const gamepadThumbstickAxes = [
	{
		x: 0,
		y: 0,
	},
	{
		x: 0,
		y: 0,
	},
];

const heldKeys = new Set();
const pressedKeys = new Set();
const pressedKeysControlHistory = [new Set(), new Set()];
const mappedKeys = controls
	.map(({ keyboard }) => Object.values(keyboard))
	.flat();

const isButtonPressed = (id, code) => {
	if (
		heldGamepadButtons[id].has(code) &&
		!pressedGamepadButtons[id].has(code)
	) {
		pressedGamepadButtons[id].add(code);
		return true;
	}
	return false;
};

const isPressed = (code) => {
	if (heldKeys.has(code) && !pressedKeys.has(code)) {
		pressedKeys.add(code);
		return true;
	}
	return false;
};

const isPressedControlHistory = (id, code) => {
	const controlKeyId = controls[id].keyboard[code];
	const controlButtonId = controls[id].gamepad[code];
	if (
		heldKeys.has(controlKeyId) &&
		!pressedKeysControlHistory[id].has(controlKeyId)
	) {
		pressedKeysControlHistory[id].add(controlKeyId);
		return true;
	} else if (
		heldGamepadButtons[id].has(controlButtonId) &&
		!pressedKeysControlHistory[id].has(controlButtonId)
	) {
		pressedKeysControlHistory[id].add(controlButtonId);
		return true;
	}
	return false;
};

const handleKeyDown = (event) => {
	if (!mappedKeys.includes(event.code)) return;
	event.preventDefault();
	if (!heldKeys.has(event.code)) {
		heldKeys.add(event.code);
	}
};

const handleKeyUp = (event) => {
	event.preventDefault();
	if (heldKeys.has(event.code)) {
		heldKeys.delete(event.code);
		pressedKeys.delete(event.code);
		if (Object.values(controls[0].keyboard).includes(event.code))
			pressedKeysControlHistory[0].delete(event.code);
		else pressedKeysControlHistory[1].delete(event.code);
	}
};

export const registerKeyboardEvents = () => {
	window.addEventListener('keydown', handleKeyDown);
	window.addEventListener('keyup', handleKeyUp);
};

const handleGamepadConnected = (event) => {
	const gamepad = event.gamepad;
	console.log(
		`gamepad named ${gamepad.id} connected for player ${gamepad.index + 1}`
	);
};

const handleGamepadDisconnected = (event) => {
	const gamepad = event.gamepad;
	console.log(
		`gamepad named ${gamepad.id} disconnected for player ${gamepad.index + 1}`
	);
};

const updateGamepadButtons = (gamePadIndex, gamePad) => {
	if (!gamePad) return;
	gamePad.buttons.forEach((button, index) => {
		if (!mappedButtons.has(index)) return;
		if (button.pressed) {
			heldGamepadButtons[gamePadIndex].add(index);
		} else {
			heldGamepadButtons[gamePadIndex].delete(index);
			pressedGamepadButtons[gamePadIndex].delete(index);
			pressedKeysControlHistory[gamePadIndex].delete(index);
		}
	});
};

const updateGamepadAxes = (gamePadIndex, gamePad) => {
	if (!gamePad) return;
	gamepadThumbstickAxes[gamePadIndex].x = gamePad.axes[0];
	gamepadThumbstickAxes[gamePadIndex].y = gamePad.axes[1];
};

export const updateGamePads = () => {
	const gamepadList = navigator.getGamepads();

	for (const [gamePadIndex, gamePad] of gamepadList.entries()) {
		updateGamepadButtons(gamePadIndex, gamePad);
		updateGamepadAxes(gamePadIndex, gamePad);
	}
};

export const registerGamepadEvents = () => {
	window.addEventListener('gamepadconnected', handleGamepadConnected);
	window.addEventListener('gamepaddisconnected', handleGamepadDisconnected);
};

export const isLeft = (id) => {
	if (gamepadThumbstickAxes[id].x < -1 * CONTROLLER_DEADZONE) return true;
	return (
		heldKeys.has(controls[id].keyboard[Control.LEFT]) ||
		heldGamepadButtons[id].has(controls[id].gamepad[Control.LEFT])
	);
};

export const isUp = (id) => {
	if (gamepadThumbstickAxes[id].y < -1 * CONTROLLER_DEADZONE) return true;

	return (
		heldKeys.has(controls[id].keyboard[Control.UP]) ||
		heldGamepadButtons[id].has(controls[id].gamepad[Control.UP])
	);
};

export const isRight = (id) => {
	if (gamepadThumbstickAxes[id].x > CONTROLLER_DEADZONE) return true;

	return (
		heldKeys.has(controls[id].keyboard[Control.RIGHT]) ||
		heldGamepadButtons[id].has(controls[id].gamepad[Control.RIGHT])
	);
};

export const isDown = (id) => {
	if (gamepadThumbstickAxes[id].y > CONTROLLER_DEADZONE) return true;

	return (
		heldKeys.has(controls[id].keyboard[Control.DOWN]) ||
		heldGamepadButtons[id].has(controls[id].gamepad[Control.DOWN])
	);
};

export const isForward = (id, direction) => {
	return direction === FighterDirection.RIGHT ? isRight(id) : isLeft(id);
};

export const isBackward = (id, direction) => {
	return direction === FighterDirection.RIGHT ? isLeft(id) : isRight(id);
};

export const isIdle = (id) =>
	isUp(id) || isDown(id) || isLeft(id) || isRight(id);

export const isKeyPressed = (id, code, forControlHistory) => {
	if (forControlHistory) return isPressedControlHistory(id, code);

	return (
		isButtonPressed(id, controls[id].gamepad[code]) ||
		isPressed(controls[id].keyboard[code])
	);
};

export const isLightPunch = (id, forControlHistory = false) => {
	return isKeyPressed(id, Control.LIGHT_PUNCH, forControlHistory);
};
export const isMediumPunch = (id, forControlHistory = false) => {
	return isKeyPressed(id, Control.MEDIUM_PUNCH, forControlHistory);
};
export const isHeavyPunch = (id, forControlHistory = false) => {
	return isKeyPressed(id, Control.HEAVY_PUNCH, forControlHistory);
};

export const isLightKick = (id, forControlHistory = false) => {
	return isKeyPressed(id, Control.LIGHT_KICK, forControlHistory);
};
export const isMediumKick = (id, forControlHistory = false) => {
	return isKeyPressed(id, Control.MEDIUM_KICK, forControlHistory);
};
export const isHeavyKick = (id, forControlHistory = false) => {
	return isKeyPressed(id, Control.HEAVY_KICK, forControlHistory);
};

// ============================================================
// Netplay seam (호스트-권위 P2P)
// 원본 입력 파이프라인은 그대로 두고, 원격 입력을 게임 플레이어 슬롯에
// "주입"하는 최소 접점만 추가한다. 상태머신은 여전히 전역 held/pressed
// Set만 읽으므로, 이 Set을 올바르게 유지하면 기존 로직이 그대로 작동한다.
// ============================================================

const directionCheck = {
	[Control.LEFT]: isLeft,
	[Control.RIGHT]: isRight,
	[Control.UP]: isUp,
	[Control.DOWN]: isDown,
};

// 로컬 하드웨어에서 특정 컨트롤이 눌려 있는지 (키보드 + 게임패드 버튼 + 축).
const isControlHeldLocally = (controlIndex, control) => {
	if (directionCheck[control]) return directionCheck[control](controlIndex);
	return (
		heldKeys.has(controls[controlIndex].keyboard[control]) ||
		heldGamepadButtons[controlIndex].has(controls[controlIndex].gamepad[control])
	);
};

/**
 * 로컬 플레이어의 현재 입력을 와이어 비트마스크로 캡처한다 (게스트가 매 프레임 호출).
 * @param {number} controlIndex 로컬 조작에 쓰는 컨트롤 매핑 인덱스 (기본 0 = WASD)
 * @returns {number} 10비트 입력 마스크
 */
export const readLocalInputBits = (controlIndex = 0) => {
	const state = {};
	for (const control of CONTROL_ORDER) {
		state[control] = isControlHeldLocally(controlIndex, control);
	}
	return encodeControls(state);
};

/**
 * 원격에서 받은 입력 비트마스크를 게임 플레이어 슬롯에 주입한다 (호스트가 매 프레임 호출).
 * keydown/keyup 핸들러와 동일하게 held/pressed Set을 갱신해 엣지 감지까지 보존한다.
 * @param {number} gamePlayerId 주입 대상 게임 플레이어 (호스트에선 보통 1)
 * @param {number} bits readLocalInputBits로 인코딩된 10비트 마스크
 */
export const applyRemoteInput = (gamePlayerId, bits) => {
	for (const control of CONTROL_ORDER) {
		const keyCode = controls[gamePlayerId].keyboard[control];
		if (isControlSet(bits, control)) {
			heldKeys.add(keyCode);
		} else if (heldKeys.has(keyCode)) {
			heldKeys.delete(keyCode);
			pressedKeys.delete(keyCode);
			pressedKeysControlHistory[gamePlayerId].delete(keyCode);
		}
	}
};
