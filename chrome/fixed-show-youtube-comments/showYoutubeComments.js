// Show YouTube comments while watching - patched content script
// Keeps #comments in the right-hand column and #related under the player,
// and re-applies the layout whenever YouTube moves #related back
// (ytd-watch-flexy.updateWatchFeedLocation() does secondary-inner.appendChild(#related)).
(() => {
	'use strict';

	const S = globalThis.__sycwState || (globalThis.__sycwState = {});

	const byId = id => document.getElementById(id);
	const isSingleColumn = () =>
		!!document.querySelector('ytd-watch-flexy')?.hasAttribute('is-single-column');

	// The container inside #below where YouTube normally puts #comments.
	// That is where we park #related, so remember it once and mark it.
	function homeBox() {
		let box = document.querySelector('#below [data-sycw-home]');
		if (box && box.isConnected) return box;

		const below = byId('below');
		if (!below) return null;

		const comments = byId('comments');
		const related = byId('related');
		const candidate =
			(comments && below.contains(comments) && comments.parentElement) ||
			(related && below.contains(related) && related.parentElement);
		if (!candidate) return null;

		candidate.dataset.sycwHome = '1';
		return candidate;
	}

	// Idempotent: does nothing when the layout is already the way we want it.
	function applyLayout() {
		const comments = byId('comments');
		const related = byId('related');
		const secondary = byId('secondary-inner');
		if (!comments || !related || !secondary) return false;

		const box = homeBox();
		if (!box) return false;

		if (isSingleColumn()) {
			// No side column: give both back to YouTube's single-column position.
			if (secondary.contains(related)) box.appendChild(related);
			if (secondary.contains(comments)) box.appendChild(comments);
		} else {
			if (!box.contains(related)) box.appendChild(related);
			if (!secondary.contains(comments)) secondary.appendChild(comments);
		}
		return true;
	}

	function watchForYoutubeMoves() {
		S.observer?.disconnect();
		const targets = [byId('secondary-inner'), homeBox()].filter(Boolean);
		if (!targets.length) return;

		S.observer = new MutationObserver(() => {
			clearTimeout(S.reapply);
			S.reapply = setTimeout(applyLayout, 0);
		});
		targets.forEach(target => S.observer.observe(target, { childList: true }));
	}

	function start() {
		clearTimeout(S.retry);
		if (!applyLayout()) {
			S.retry = setTimeout(start, 500);
			return;
		}
		watchForYoutubeMoves();
	}

	if (!S.navHooked) {
		S.navHooked = true;
		document.addEventListener('yt-navigate-finish', () => setTimeout(start, 0), true);
	}

	start();
})();
