import {
	registerGamepadEvents,
	registerKeyboardEvents,
	updateGamePads,
} from './engine/InputHandler.js';
import { getContext } from './utils/context.js';
import { BattleScene } from './scenes/BattleScene.js';
import { GAME_SPEED } from './constants/game.js';
import { StartScene } from './scenes/StartScene.js';
import { ContextHandler } from './engine/ContextHandler.js';
import { gameState } from './states/gameState.js';

export class StreetFighterGame {
	context = getContext();

	frameTime = {
		secondsPassed: 0,
		previous: 0,
	};

	timeStarted = 0;
	sceneStarted = false;
	nextScene = undefined;
	netSession = undefined; // 넷플레이 활성 시 주입 (bootNetplay). 기본 로컬 플레이엔 영향 없음.
	mode = 'local'; // 'local' | 'host' | 'guest'

	contextHandler = new ContextHandler(this.context);

	changeScene = (SceneClass) => {
		this.contextHandler.startDimDown();
		this.sceneStarted = false;
		this.nextScene = SceneClass;
	};

	startScene = (SceneClass) => {
		this.contextHandler.startGlowUp();
		this.scene = new SceneClass(this.changeScene);
		this.sceneStarted = true;
	};

	constructor() {
		this.startScene(StartScene);
	}

	updateScenes = () => {
		// 게스트(렌더 전용): 그리기 직전 최신 스냅샷을 적용 (배틀 씬일 때만).
		if (this.mode === 'guest' && this.scene.fighters) {
			this.netSession.applyLatestState(this.scene, gameState);
		}

		this.scene.draw(this.context);
		if (this.contextHandler.dimDown) return;
		if (!this.sceneStarted) this.startScene(this.nextScene);

		// 게스트는 시뮬을 돌리지 않는다.
		if (this.mode === 'guest') return;

		this.scene.update(this.frameTime);

		// 호스트: 시뮬 후 상태를 게스트로 전송 (배틀 씬일 때만).
		if (this.mode === 'host' && this.scene.fighters) {
			this.netSession.sendState(this.scene, gameState);
		}
	};

	frame = (time) => {
		window.requestAnimationFrame(this.frame.bind(this));

		if (this.timeStarted === 0) {
			this.timeStarted = time;
		}
		time -= this.timeStarted;
		time = time * GAME_SPEED;

		this.frameTime = {
			secondsPassed: (time - this.frameTime.previous) / 1000,
			previous: time,
		};
		updateGamePads();
		// 넷플레이: 시뮬(scene.update)이 입력을 읽기 전에 원격 입력을 주입/송신.
		this.netSession?.update();
		this.contextHandler.update(this.frameTime);
		this.context.filter = `brightness(${this.contextHandler.brightness}) contrast(${this.contextHandler.contrast})`;
		this.updateScenes();
	};

	start() {
		registerKeyboardEvents();
		registerGamepadEvents();
		window.requestAnimationFrame(this.frame.bind(this));
	}
}
