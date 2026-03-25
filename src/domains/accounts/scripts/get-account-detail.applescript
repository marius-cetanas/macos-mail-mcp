tell application "Mail"
    try
        set acct to account "{{accountName}}"
        set acctName to my escapeForJson(name of acct)
        set acctType to account type of acct as text
        if acctType contains "imap" then
            set acctType to "imap"
        else if acctType contains "pop" then
            set acctType to "pop"
        else if acctType contains "iCloud" then
            set acctType to "iCloud"
        else
            set acctType to "unknown"
        end if
        set acctEnabled to enabled of acct
        set acctEmails to email addresses of acct
        set emailsJson to ""
        repeat with i from 1 to count of acctEmails
            if i > 1 then set emailsJson to emailsJson & ", "
            set emailsJson to emailsJson & "\"" & my escapeForJson(item i of acctEmails) & "\""
        end repeat
        set acctServer to ""
        try
            set rawServer to server name of acct
            if rawServer is not missing value then set acctServer to my escapeForJson(rawServer as text)
        end try
        set acctPort to 0
        try
            set rawPort to port of acct
            if rawPort is not missing value then set acctPort to rawPort
        end try
        set acctSsl to false
        try
            set rawSsl to uses ssl of acct
            if rawSsl is not missing value then set acctSsl to rawSsl
        end try
        set acctUser to ""
        try
            set rawUser to user name of acct
            if rawUser is not missing value then set acctUser to my escapeForJson(rawUser as text)
        end try
        set acctMailboxCount to count of mailboxes of acct
        return "{\"name\": \"" & acctName & "\", \"type\": \"" & acctType & "\", \"enabled\": " & acctEnabled & ", \"emails\": [" & emailsJson & "], \"serverName\": \"" & acctServer & "\", \"port\": " & acctPort & ", \"usesSsl\": " & acctSsl & ", \"userName\": \"" & acctUser & "\", \"mailboxCount\": " & acctMailboxCount & "}"
    on error errMsg number errNum
        return "{\"error\": \"" & my escapeForJson(errMsg) & "\", \"errorNumber\": " & errNum & "}"
    end try
end tell
