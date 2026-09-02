import {
	registerGamepadEvents,
	registerKeyboardEvents,
	updateGamePads,
} from './engine/InputHandler.js';
import { getContext } from './utils/context.js';
import { BattleScene } from './scenes/BattleScene.js';
import { FRAME_TIME, GAME_SPEED } from './constants/game.js';
import { StartScene } from './scenes/StartScene.js';
import { ContextHandler } from './engine/ContextHandler.js';
import { createTimestepper } from './engine/FixedTimestep.js';
import { gameState } from './states/gameState.js';

const FIXED_DT = FRAME_TIME; // 시뮬 1틱 = 1프레임(1000/60ms). 이동량이 프레임 데이터에 픽셀로 박혀 있어 고정.
const FIXED_SECONDS = FIXED_DT / 1000;

export class StreetFighterGame {
	context = getContext();

	frameTime = {
		secondsPassed: 0,
		previous: 0,
	};

	// 고정 timestep 루프 상태 (Phase 1).
	stepper = createTimestepper({ fixedDt: FIXED_DT, maxSteps: 5 });
	simClock = 0; // 시뮬 시계(ms). 틱마다 FIXED_DT 증가 — 애니/타이머의 단일 클럭.
	lastReal = 0; // 직전 rAF의 실제 timestamp(ms).

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

	// 시뮬 한 틱(고정 dt). 입력 샘플링·원격 입력 주입/송신·씬 업데이트를 틱 경계에서 확정한다.
	simTick = () => {
		this.frameTime = { secondsPassed: FIXED_SECONDS, previous: this.simClock };

		updateGamePads();
		// 넷플레이: 시뮬(scene.update)이 입력을 읽기 전에 원격 입력을 주입/송신.
		this.netSession?.update();
		this.contextHandler.update(this.frameTime);
		this.simClock += FIXED_DT;

		// 게스트는 시뮬을 돌리지 않는다(렌더 전용). 씬 전환(dimDown) 중에도 시뮬 정지.
		if (this.mode === 'guest') return;
		if (this.contextHandler.dimDown) return;
		if (!this.sceneStarted) return; // 씬 스왑은 render()에서 처리.

		this.scene.snapshotForInterp?.(); // 렌더 보간용 직전 틱 위치 기록 (update 직전).
		this.scene.update(this.frameTime);

		// 호스트: 시뮬 후 상태를 게스트로 전송 (배틀 씬 + 세션 준비 시).
		if (this.mode === 'host' && this.scene.fighters) {
			this.netSession?.sendState(this.scene, gameState);
		}
	};

	// 매 rAF 1회. 그리기 + 씬 스왑 부기(簿記). (Phase 2에서 alpha 보간을 여기서 소비.)
	render = () => {
		// 게스트(렌더 전용): 그리기 직전 최신 스냅샷을 적용 (배틀 씬 + 세션 준비 시).
		// netSession은 WebRTC 협상 중엔 아직 없을 수 있으므로 옵셔널 가드.
		if (this.mode === 'guest' && this.scene.fighters) {
			this.netSession?.applyLatestState(this.scene, gameState);
		}

		this.context.filter = `brightness(${this.contextHandler.brightness}) contrast(${this.contextHandler.contrast})`;
		this.scene.draw(this.context, this.stepper.alpha);
		if (this.contextHandler.dimDown) return;
		if (!this.sceneStarted) this.startScene(this.nextScene);
	};

	frame = (time) => {
		window.requestAnimationFrame(this.frame.bind(this));

		if (this.timeStarted === 0) {
			this.timeStarted = time;
			this.lastReal = time;
		}

		// 실제 경과(ms)에 GAME_SPEED를 곱해 누산 → 고정 dt 틱으로 소비.
		const elapsed = (time - this.lastReal) * GAME_SPEED;
		this.lastReal = time;

		const steps = this.stepper.advance(elapsed);
		for (let i = 0; i < steps; i += 1) this.simTick();

		this.render();
	};

	start() {
		registerKeyboardEvents();
		registerGamepadEvents();
		window.requestAnimationFrame(this.frame.bind(this));
	}
}
