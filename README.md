# Formbar.js
Formbar.js is a classroom polling and management system. The two key components are tools for *Form*ative assessment, and a visual representation of the class status, typically a type of visual *bar*. Formbar was written in Python to run on a Raspberry Pi. Formbar.js is a rewrite in *J*ava*S*cript, and is designed to be platform-agnostic by way of nodeJS. The tertirary feature is to provide technically-minded students a means of writing interactive software to interact with the classroom management.

## Goal
- Reach feature parity with formbar
- Raspberry Pi Bot handles all physical features (lights, sound, IR remote)
- All interactions can be done by websockets, and will send out websocket notifications on changes
- Have permanent logins and seperate classes

## Documentation inside of wiki