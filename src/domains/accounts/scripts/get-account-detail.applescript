on escapeQuotes(theString)
    set resultStr to ""
    repeat with i from 1 to length of theString
        set c to character i of theString
        if c is "\"" then
            set resultStr to resultStr & "\\\""
        else if c is "\\" then
            set resultStr to resultStr & "\\\\"
        else
            set resultStr to resultStr & c
        end if
    end repeat
    return resultStr
end escapeQuotes

tell application "Mail"
    try
        set acct to account "{{accountName}}"
        set acctName to my escapeQuotes(name of acct)
        set acctType to account type of acct as text
        if acctType contains "imap" then
            set acctType to "imap"
        else if acctType contains "pop" then
            set acctType to "pop"
        else if acctType contains "iCloud" then
            set acctType to "iCloud"
        end if
        set acctEnabled to enabled of acct
        set acctEmails to email addresses of acct
        set emailsJson to ""
        repeat with i from 1 to count of acctEmails
            if i > 1 then set emailsJson to emailsJson & ", "
            set emailsJson to emailsJson & "\"" & my escapeQuotes(item i of acctEmails) & "\""
        end repeat
        set acctServer to my escapeQuotes(server name of acct)
        set acctPort to port of acct
        set acctSsl to uses ssl of acct
        set acctUser to my escapeQuotes(user name of acct)
        set acctMailboxCount to count of mailboxes of acct
        return "{\"name\": \"" & acctName & "\", \"type\": \"" & acctType & "\", \"enabled\": " & acctEnabled & ", \"emails\": [" & emailsJson & "], \"serverName\": \"" & acctServer & "\", \"port\": " & acctPort & ", \"usesSsl\": " & acctSsl & ", \"userName\": \"" & acctUser & "\", \"mailboxCount\": " & acctMailboxCount & "}"
    on error errMsg number errNum
        return "{\"error\": \"" & errMsg & "\", \"errorNumber\": " & errNum & "}"
    end try
end tell
