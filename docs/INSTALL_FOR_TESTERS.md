# InstaDesk — installing for testing

> A short guide you can forward to anyone testing InstaDesk on their own Windows PC.
> Nothing here needs a GitHub account: the release is public.

---

## 1. Download

**https://github.com/FCCXE/InstaDesk-V2.0/releases/latest**

Download the **`InstaDesk_…_x64-setup.exe`** file (about 66 MB).

> The page always shows the newest version. The details below were captured for **v0.5.2**; if the
> page offers something newer, take that instead — the checksum will simply not match, which is
> expected rather than a problem.

Your browser may say the file *"isn't commonly downloaded"*. Choose **Keep**. InstaDesk is new
and very few people have downloaded it yet, which is the whole reason for that message.

**To check you got the right file** (optional), run this in PowerShell and compare:

```powershell
Get-FileHash "$HOME\Downloads\InstaDesk_0.5.2_x64-setup.exe" -Algorithm SHA256
```

```
0B764790FB7804C9F55A14F390A5DEAE0452A3851858119C7C76C9C0623FF5A3
```

---

## 2. Expect a Windows warning — this is normal, and here is exactly what to click

InstaDesk is not yet signed with a paid Windows code-signing certificate, so Windows does not
recognise the publisher. **You will see a blue full-screen box:**

> **Windows protected your PC**
> Microsoft Defender SmartScreen prevented an unrecognised app from starting.

Click **More info**, then **Run anyway**.

The Windows permission prompt that follows will say **Publisher: Unknown**. That is the same
cause, not a second problem.

> If you are not comfortable with that, stop and say so — that is a reasonable position, and it
> is a real thing for us to fix rather than for you to work around.

---

## 3. What your PC needs

| | |
|---|---|
| Windows | 10 or 11, **64-bit** |
| .NET | **Not needed** — it is built into the app |
| WebView2 | Already on Windows 11 and current Windows 10. If it is missing, the installer fetches it, so keep an internet connection during setup |
| Admin rights | Not required to use InstaDesk |

InstaDesk installs for your user account and appears in the Start menu as **InstaDesk**.

---

## 4. Two things to know before you use it

**InstaDesk closes windows on purpose.** *Close all windows* in the bottom bar, and *Switch mode*
beside the Quick Presets, both shut windows down. Nothing is ever force-killed — anything holding
unsaved work still prompts you exactly as if you had clicked its X — but do not go straight to
those buttons with unsaved work open, the same as you would not with any new tool.

**Anonymous usage data is ON by default.** If you would rather it were not, turn it off first:
**Settings → Share anonymous usage data**.

---

## 5. Updates

InstaDesk checks for new versions itself and will offer them to you. Updates *are*
cryptographically signed and verified before installing, so you only have to trust the
first download.

---

## 6. Reporting what you find

Useful things to include: what you did, what you expected, what happened, and your Windows
version. The **version number** is in the top bar of the app — please quote it.

If a window did not end up where you expected, say which app it was — some programs
(Outlook, Teams, and anything already running) place their own windows and refuse to be moved.
