/*
to use tabs
for each tab button add the class tab
for each tab content add the class tabContent
to connect the tab button to the tab content add the data-tab-group attribute
add default to the tab content that should be shown by default
and add pressed to the starting tab button

the tab button and content can be any type of element
the tab button and content can be anywhere in the html

example:
<button class="tab" data-tab-group="groupname">tabname</button>
<div class="tabContent" data-tab-group="groupname">content</div>
*/
let tabs = document.getElementsByClassName("tab");
let tabContents = document.getElementsByClassName("tabContent");

function changeTab(tab, tabGroup) {
    let tabs = document.querySelectorAll(`.tab[data-tab-group="${tabGroup}"]`);
    let tabContents = document.querySelectorAll(`.tabContent[data-tab-group="${tabGroup}"]`);

    if (!tab) {
        tab = document.querySelector(`.tabContent.default[data-tab-group="${tabGroup}"]`).id;
    }

    for (let tabContent of tabContents) {
        if (tabContent.id == tab) {
            tabContent.style.display = "";
        } else {
            tabContent.style.display = "none";
        }
    }

    for (let tabButton of tabs) {
        if (tabButton.id == tab) {
            tabButton.classList.add("pressed");
        } else {
            tabButton.classList.remove("pressed");
        }
    }
}

for (let tabContent of tabContents) {
    if (!tabContent.classList.contains("default")) {
        tabContent.style.display = "none";
    }
}

for (let tab of tabs) {
    if (!tab.onclick) {
        tab.onclick = (event) => {
            if (tab.classList.contains("pressed")) {
                changeTab("", event.target.dataset.tabGroup);
            } else {
                changeTab(event.target.id, event.target.dataset.tabGroup);
            }
        };
    }
}
