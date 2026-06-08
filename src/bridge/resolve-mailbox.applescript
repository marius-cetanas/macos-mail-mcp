-- macos-mail-mcp — shared mailbox-resolution handlers.
-- Prepended to every domain script by the runner (see applescript-runner.ts),
-- so any script can call `my resolveMailbox(...)` / `my mailboxFullName(...)`.

-- Build the full, addressable path of a mailbox by walking its container chain.
-- Gmail's special folders live under a "[Gmail]" parent, so the mailbox whose
-- leaf name is "All Mail" is only addressable as "[Gmail]/All Mail". We prepend
-- each parent name until the parent is the account itself: in Mail's model a
-- folder grouping has class "container" (e.g. "[Gmail]", "Sync Issues") and a
-- nested user folder has class "mailbox", while the account is an "... account"
-- class — so we stop as soon as the parent's class contains "account". A
-- top-level mailbox stops on the first step and returns just its leaf name.
on mailboxFullName(mb)
    using terms from application "Mail"
        set theName to (name of mb as text)
        set cur to mb
        repeat
            try
                set c to container of cur
            on error
                exit repeat
            end try
            if (class of c as text) contains "account" then exit repeat
            set theName to ((name of c as text) & "/" & theName)
            set cur to c
        end repeat
        return theName
    end using terms from
end mailboxFullName

-- Resolve a mailbox by name within an account, returning an addressable reference.
-- Accepts either the full path ("[Gmail]/All Mail") or the leaf name ("All Mail").
-- A direct lookup handles top-level mailboxes and full paths; the fallback scan
-- handles leaf names of namespaced mailboxes (Gmail's [Gmail]/* folders), which
-- Mail.app lists but cannot resolve via `mailbox "<leaf>" of account`.
on resolveMailbox(acctName, mboxName)
    tell application "Mail"
        set acct to account acctName
        -- 1. Direct address. `get name` forces evaluation so a bad leaf errors here.
        try
            set mb to mailbox mboxName of acct
            get name of mb
            return mb
        end try
        -- 2. Fallback: match on leaf OR full path, return the full-path reference.
        repeat with candidate in (every mailbox of acct)
            set leafName to (name of candidate as text)
            set fullName to my mailboxFullName(candidate)
            if (mboxName is leafName) or (mboxName is fullName) then
                return mailbox fullName of acct
            end if
        end repeat
        error "Can't find mailbox \"" & mboxName & "\" in account \"" & acctName & "\"" number -1728
    end tell
end resolveMailbox
