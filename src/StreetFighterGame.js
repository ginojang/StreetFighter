import {
	registerGamepadEvents,
	registerKeyboardEvents,
	updateGamePads,
} from './engine/InputHandler.js';
import { getContext, resetTransform } from './utils/context.js';
import { BattleScene } from './scenes/BattleScene.js';
import { FRAME_TIME, GAME_SPEED } from './constants/game.js';
import { StartScene } from './scenes/StartScene.js';
import { ContextHandler } from './engine/ContextHandler.js';
import { createTimestepper } from './engine/FixedTimestep.js';
import { renderSettings } from './state/renderSettings.js';
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
	// 렌더 보간/블러는 공유 상태(renderSettings)에서 실시간으로 읽는다(세팅 UI 가 바꾸면 즉시 반영).
	frameDeltaEma = FIXED_DT; // 실측 프레임 간격 EMA(ms). 초기 60Hz 가정.
	interpActive = false; // 이번 프레임 보간 사용 여부(frame에서 갱신).
	prevFrame = undefined; // 직전 프레임(클린) 오프스크린 캔버스
	curBuf = undefined; // 이번 프레임 클린 저장용(더블버퍼)
	prevCtx = undefined;
	curCtx = undefined;

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

	// 픽셀 스무딩(공간축 잔상 마스킹): 스프라이트 4× 업스케일을 bilinear 로 부드럽게 한다.
	// 캔버스 플래그는 매 프레임 싸게 재설정(라이브 토글 보장), CSS 다운스케일 클래스는 변할 때만.
	applySmoothing = () => {
		const on = renderSettings.smooth;
		this.context.imageSmoothingEnabled = on;
		if (this._smoothCss !== on) {
			this._smoothCss = on;
			this.context.canvas.classList.toggle('smooth', on);
		}
	};

	// 프레임 블렌딩(모션블러): display = a·직전클린 + (1-a)·현재클린. **비재귀 더블버퍼** —
	// 직전 "클린"(블렌드 안 된) 프레임 1장만 섞으므로 누적·어두워짐·이전 씬 잔류가 없다.
	// 정지 화면은 prev≈현재라 그대로(선명), 이동체만 2위치로 부드럽게 번진다(sample-and-hold 마스킹).
	blendFrame = () => {
		if (renderSettings.blendAmount <= 0) return;
		const ctx = this.context;
		const canvas = ctx.canvas;
		const mk = () => {
			const c = document.createElement('canvas');
			c.width = canvas.width;
			c.height = canvas.height;
			const cx = c.getContext('2d');
			cx.imageSmoothingEnabled = false;
			return [c, cx];
		};
		if (!this.prevFrame) {
			[this.prevFrame, this.prevCtx] = mk();
			[this.curBuf, this.curCtx] = mk();
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			this.prevCtx.drawImage(canvas, 0, 0); // 첫 프레임 클린 저장, 블렌드는 다음부터
			return;
		}
		ctx.setTransform(1, 0, 0, 1, 0, 0); // 1:1 디바이스 좌표
		ctx.filter = 'none';
		// 1) 현재 클린을 curBuf에 저장(오버레이 전)
		this.curCtx.clearRect(0, 0, canvas.width, canvas.height);
		this.curCtx.drawImage(canvas, 0, 0);
		// 2) 직전 클린을 알파로 덧그림 → 화면 = a·prev + (1-a)·cur
		ctx.globalAlpha = renderSettings.blendAmount;
		ctx.drawImage(this.prevFrame, 0, 0);
		ctx.globalAlpha = 1;
		// 3) 스왑: 다음 프레임의 prev = 이번 프레임 클린
		[this.prevFrame, this.curBuf] = [this.curBuf, this.prevFrame];
		[this.prevCtx, this.curCtx] = [this.curCtx, this.prevCtx];
	};

	// 매 rAF 1회. 그리기 + 씬 스왑 부기(簿記). (Phase 2에서 alpha 보간을 여기서 소비.)
	render = () => {
		// 게스트(렌더 전용): 그리기 직전 최신 스냅샷을 적용 (배틀 씬 + 세션 준비 시).
		// netSession은 WebRTC 협상 중엔 아직 없을 수 있으므로 옵셔널 가드.
		if (this.mode === 'guest' && this.scene.fighters) {
			this.netSession?.applyLatestState(this.scene, gameState);
		}

		// 필터는 전환(페이드) 중에만. 평상시(brightness=1,contrast=1)엔 'none' —
		// 'none'이 아니면 매 draw마다 오프스크린 필터 버퍼링이 걸려 대형 캔버스(1528×896)에서
		// 프레임이 붕괴한다(검은/멈춤 화면 원인). 전환은 짧으니 그때만 필터를 켠다.
		const { brightness, contrast } = this.contextHandler;
		this.context.filter =
			brightness === 1 && contrast === 1
				? 'none'
				: `brightness(${brightness}) contrast(${contrast})`;
		// 매 프레임 캔버스를 지우고(잔상 방지) 베이스 스케일(게임단위→디스플레이픽셀)로 변환 리셋.
		this.context.setTransform(1, 0, 0, 1, 0, 0);
		this.context.clearRect(
			0,
			0,
			this.context.canvas.width,
			this.context.canvas.height
		);
		resetTransform(this.context);
		this.applySmoothing(); // 픽셀 스무딩 라이브 반영(renderSettings.smooth)
		// 보간 비활성(60Hz auto/off)이면 alpha=1 → 현재 틱 위치로 그림(지연·지터 없이 선명).
		this.scene.draw(this.context, this.interpActive ? this.stepper.alpha : 1);
		this.blendFrame();
		if (this.contextHandler.dimDown) return;
		if (!this.sceneStarted) this.startScene(this.nextScene);
	};

	frame = (time) => {
		window.requestAnimationFrame(this.frame.bind(this));

		if (this.timeStarted === 0) {
			this.timeStarted = time;
			this.lastReal = time;
		}

		// 실제 프레임 간격(ms) 실측 → EMA. GAME_SPEED 곱하기 전의 순수 시간.
		const rawDelta = time - this.lastReal;
		if (rawDelta > 0 && rawDelta < 100) {
			this.frameDeltaEma += (rawDelta - this.frameDeltaEma) * 0.1;
		}
		// 보간 사용 여부: on/off 강제 또는 auto(디스플레이가 60Hz보다 확실히 빠를 때만).
		this.interpActive =
			renderSettings.interpMode === 'on'
				? true
				: renderSettings.interpMode === 'off'
				? false
				: this.frameDeltaEma < FIXED_DT * 0.85; // auto: ~70Hz 초과면 보간

		// 실제 경과에 GAME_SPEED를 곱해 누산 → 고정 dt 틱으로 소비.
		const elapsed = rawDelta * GAME_SPEED;
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
