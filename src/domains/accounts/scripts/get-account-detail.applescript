tell application "Mail"
    try
        set acct to account "{{accountName}}"
        set acctName to name of acct
        set acctType to account type of acct as text
        set acctEnabled to enabled of acct
        set acctEmails to email addresses of acct
        set emailsJson to ""
        repeat with i from 1 to count of acctEmails
            if i > 1 then set emailsJson to emailsJson & ", "
            set emailsJson to emailsJson & "\"" & item i of acctEmails & "\""
        end repeat
        set acctServer to server name of acct
        set acctPort to port of acct
        set acctSsl to uses ssl of acct
        set acctUser to user name of acct
        set acctMailboxCount to count of mailboxes of acct
        return "{\"name\": \"" & acctName & "\", \"type\": \"" & acctType & "\", \"enabled\": " & acctEnabled & ", \"emails\": [" & emailsJson & "], \"serverName\": \"" & acctServer & "\", \"port\": " & acctPort & ", \"usesSsl\": " & acctSsl & ", \"userName\": \"" & acctUser & "\", \"mailboxCount\": " & acctMailboxCount & "}"
    on error errMsg number errNum
        return "{\"error\": \"" & errMsg & "\", \"errorNumber\": " & errNum & "}"
    end try
end tell
