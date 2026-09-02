import { RENDER_SCALE } from '../constants/game.js';
import { SCENE_HEIGHT, SCENE_WIDTH } from '../constants/stage.js';

// 게임 좌표를 디스플레이 픽셀 격자에 스냅한다(1/RENDER_SCALE 게임픽셀 = 1 디스플레이픽셀).
// 게임픽셀 단위 Math.floor 대신 이걸 쓰면 이동이 RENDER_SCALE 배 곱게 나뉘어 부드럽고,
// 그려지는 픽셀은 여전히 디스플레이 픽셀에 딱 맞아 크리스프하다(에지 블러 없음).
export const snap = (value) => Math.floor(value * RENDER_SCALE) / RENDER_SCALE;

// 캔버스 변환을 "베이스 스케일"(게임단위 → 디스플레이픽셀)로 되돌린다. 방향 뒤집기용
// context.scale(dir,1) 뒤의 리셋은 identity가 아니라 이 베이스로 돌아와야 스케일이 유지된다.
export const resetTransform = (context) =>
	context.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);

export const drawFrame = (context, image, dimensions, x, y, direction = 1) => {
	const [sourceX, sourceY, sourceWidth, sourceHeight] = dimensions;

	context.scale(direction, 1);
	context.drawImage(
		image,
		sourceX,
		sourceY,
		sourceWidth,
		sourceHeight,
		x * direction,
		y,
		sourceWidth,
		sourceHeight
	);

	resetTransform(context);
};

export const getContext = () => {
	const canvasEL = document.querySelector('canvas');
	// 백킹 해상도를 게임단위 × RENDER_SCALE 로 고정(모든 기기 동일). CSS가 화면에 비율유지로 맞춘다.
	canvasEL.width = SCENE_WIDTH * RENDER_SCALE;
	canvasEL.height = SCENE_HEIGHT * RENDER_SCALE;
	const context = canvasEL.getContext('2d');
	context.imageSmoothingEnabled = false; // 픽셀아트: 정수배 확대라도 뭉개지 않게
	return context;
};
