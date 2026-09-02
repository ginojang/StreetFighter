import { FRAME_TIME } from '../../../constants/game.js';
import { snap } from '../../../utils/context.js';

export class HitSplash {
	constructor(x, y, playerId, entities) {
		this.entities = entities;
		this.position = { x, y };
		this.playerId = playerId;
		this.image = document.getElementById('Decals');

		this.frames = new Map();
		this.animationFrame = 0;
		this.animationTimer = 0;
		this.hasSplashEnded = false;
	}

	update = (time) => {
		if (this.animationTimer + FRAME_TIME * 4 > time.previous) return;
		this.animationTimer = time.previous;
		this.animationFrame++;
		if (this.animationFrame >= this.frames[this.playerId].length)
			this.entities.remove(this);
	};

	draw = (context, camera) => {
		const [[sourceX, sourceY, sourceWidth, sourceHeight], [originX, originY]] =
			this.frames[this.playerId][this.animationFrame];

		context.drawImage(
			this.image,
			sourceX,
			sourceY,
			sourceWidth,
			sourceHeight,
			snap(this.position.x - camera.position.x - originX),
			snap(this.position.y - camera.position.y - originY),
			sourceWidth,
			sourceHeight
		);
	};
}
