let tabs = document.getElementsByClassName('tab')
let tabContents = document.getElementsByClassName('tabContent')

function changeTab(tab, tabGroup) {
	let tabs = document.querySelectorAll(`.tab[data-tab-group="${tabGroup}"]`);
	let tabContents = document.querySelectorAll(`.tabContent[data-tab-group="${tabGroup}"]`);

	if (!tab)
		tab = document.querySelector(`.tabContent.default[data-tab-group="${tabGroup}"]`).id

	for (let tabContent of tabContents) {
		if (tabContent.id == tab) tabContent.style.display = ''
		else tabContent.style.display = 'none'
	}

	for (let tabButton of tabs) {
		if (tabButton.id == tab)
			tabButton.classList.add('pressed')
		else
			tabButton.classList.remove('pressed')
	}
}

for (let tabContent of tabContents) {
	if (!tabContent.classList.contains('default'))
		tabContent.style.display = 'none'
}

for (let tab of tabs) {
	if (!tab.onclick)
		tab.onclick = (event) => {
			if (tab.classList.contains('pressed'))
				changeTab('', event.target.dataset.tabGroup)
			else
				changeTab(event.target.id, event.target.dataset.tabGroup)
		}
}