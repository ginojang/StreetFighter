import { StreetFighterGame } from './StreetFighterGame.js';
import { bootNetplay } from './net/netplayBoot.js';

window.onload = () => {
	const game = new StreetFighterGame();
	bootNetplay(game); // URL에 ?net= 이 없으면 no-op (일반 로컬 플레이 그대로)
	game.start();
};
