tell application "Mail"
    try
        set acct to account "{{accountName}}"
        set acctName to my escapeForJson(name of acct)
        set acctType to my accountTypeName(account type of acct as text)
        set acctTypeJson to my escapeForJson(acctType)
        set acctEnabled to enabled of acct
        set acctEmails to email addresses of acct
        set emailsJson to ""
        repeat with i from 1 to count of acctEmails
            if i > 1 then set emailsJson to emailsJson & ", "
            set emailsJson to emailsJson & "\"" & my escapeForJson(item i of acctEmails) & "\""
        end repeat
        set acctServerJson to "null"
        set acctPortJson to "null"
        set acctSslJson to "null"
        if acctType is "imap" or acctType is "pop" or acctType is "iCloud" or acctType is "smtp" then
            try
                set rawServer to server name of acct
                if rawServer is not missing value then set acctServerJson to "\"" & my escapeForJson(rawServer as text) & "\""
            end try
            try
                set rawPort to port of acct
                if rawPort is not missing value then set acctPortJson to my integerForJson(rawPort)
            end try
            try
                set rawSsl to uses ssl of acct
                if rawSsl is true then set acctSslJson to "true"
                if rawSsl is false then set acctSslJson to "false"
            end try
        end if
        set acctUser to ""
        try
            set rawUser to user name of acct
            if rawUser is not missing value then set acctUser to my escapeForJson(rawUser as text)
        end try
        set acctFullName to ""
        try
            set rawFullName to full name of acct
            if rawFullName is not missing value then set acctFullName to my escapeForJson(rawFullName as text)
        end try
        set acctMailboxCount to count of mailboxes of acct
        return "{\"name\": \"" & acctName & "\", \"type\": \"" & acctTypeJson & "\", \"enabled\": " & acctEnabled & ", \"fullName\": \"" & acctFullName & "\", \"emails\": [" & emailsJson & "], \"serverName\": " & acctServerJson & ", \"port\": " & acctPortJson & ", \"usesSsl\": " & acctSslJson & ", \"userName\": \"" & acctUser & "\", \"mailboxCount\": " & my integerForJson(acctMailboxCount) & "}"
    on error errMsg number errNum
        return "{\"error\": \"" & my escapeForJson(errMsg) & "\", \"errorNumber\": " & my integerForJson(errNum) & "}"
    end try
end tell

on accountTypeName(rawType)
    if rawType is "imap" then return "imap"
    if rawType is "pop" then return "pop"
    if rawType is "iCloud" then return "iCloud"
    if rawType is "smtp" then return "smtp"
    return rawType
end accountTypeName
