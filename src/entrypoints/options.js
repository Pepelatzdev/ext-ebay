/* global ECA, ECAChromeClient, ECAOptionsView */
ECAOptionsView.create({
	document,
	client: ECAChromeClient.create({ chrome, navigator, policy: ECA }),
	policy: ECA,
});
