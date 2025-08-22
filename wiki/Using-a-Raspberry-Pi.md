## Remote Connection to Raspberry Pi
- Use [Real VNC Viewer](https://www.realvnc.com/en/connect/download/viewer/) to connect to the Raspberry Pi desktop remotely.

- Use ssh to connect to the Raspberry Pi terminal remotely.

- Use putty to connect to the Raspberry Pi terminal remotely.

- Use Samba to connect to the Raspberry Pi file system remotely.
	- [This how to connect to the Samba Server](https://ubuntu.com/tutorials/install-and-configure-samba#4-setting-up-user-accounts-and-connecting-to-share)
  - You can also use the hostname to connect for example "\\\\pi\GitHub"

## Multiple Terminals (screen)
- `screen` to start a new terminal
- `screen -r` to resume the terminal
- `screen -ls` to list all the terminals
- `screen -d` to detach the terminal
  - You can also use `screen -rd` to connect and force disconnect all other users
- Type `exit` or `Ctrl + A + D` to detach the terminal

## File Transfer (scp)
- `scp <source> <destination>`
  - `<source>`: The path to the file or directory that you want to copy. This can be a local path or a path on a remote server. If it's on a remote server, the format is `user@ip:path`.
  - `<destination>`: The path where you want the file or directory to be copied to. This can be a local path or a path on a remote server. If it's on a remote server, the format is `user@ip:path`, to get to a users home on linux use `/home/user/` for example `/home/pi/`.
- `scp -r <source> <destination>` to transfer directories
- `scp -P <port> <source> <destination>` to transfer files using a different port
  - On windows you need to use -P 22 which is the default port for it to work
- Windows uses `pscp` instead of `scp` which does the same thing