tell application "Mail"
    try
        set accountList to ""
        set allAccounts to every account
        repeat with acct in allAccounts
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
            if accountList is not "" then set accountList to accountList & ", "
            set accountList to accountList & "{\"name\": \"" & acctName & "\", \"type\": \"" & acctType & "\", \"enabled\": " & acctEnabled & ", \"emails\": [" & emailsJson & "]}"
        end repeat
        return "[" & accountList & "]"
    on error errMsg number errNum
        return "{\"error\": \"" & my escapeForJson(errMsg) & "\", \"errorNumber\": " & errNum & "}"
    end try
end tell
