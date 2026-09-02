import {
	STAGE_MID_POINT,
	STAGE_PADDING,
	STAGE_WIDTH,
} from "../../../constants/stage.js";
import { RENDER_SCALE } from "../../../constants/game.js";

export class SkewedFloor {
	constructor(image, dimensions) {
		this.image = image;
		this.dimensions = dimensions;
	}

	draw = (context, camera, y) => {
		const [sourceX, sourceY, width, height] = this.dimensions;

		// 베이스 스케일(RENDER_SCALE)을 스큐 행렬에 곱해 넣는다. save/restore 라 이후 복원됨.
		const S = RENDER_SCALE;
		context.save();
		context.setTransform(
			1 * S,
			0,
			(-5.15 - (camera.position.x - (STAGE_WIDTH + STAGE_PADDING)) / 112) * S,
			1 * S,
			(32 - camera.position.x / 1.55) * S,
			(y - camera.position.y) * S
		);

		context.drawImage(
			this.image,
			sourceX,
			sourceY,
			width,
			height,
			0,
			0,
			width,
			height
		);

		context.restore();
	};
}
