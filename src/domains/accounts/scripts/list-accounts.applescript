tell application "Mail"
    try
        set accountList to ""
        set allAccounts to every account
        repeat with acct in allAccounts
            set acctName to my escapeForJson(name of acct)
            set acctType to my accountTypeName(account type of acct as text)
            set acctTypeJson to my escapeForJson(acctType)
            set acctEnabled to enabled of acct
            set acctFullName to ""
            try
                set rawFullName to full name of acct
                if rawFullName is not missing value then set acctFullName to my escapeForJson(rawFullName as text)
            end try
            set acctEmails to email addresses of acct
            set emailsJson to ""
            repeat with i from 1 to count of acctEmails
                if i > 1 then set emailsJson to emailsJson & ", "
                set emailsJson to emailsJson & "\"" & my escapeForJson(item i of acctEmails) & "\""
            end repeat
            if accountList is not "" then set accountList to accountList & ", "
            set accountList to accountList & "{\"name\": \"" & acctName & "\", \"type\": \"" & acctTypeJson & "\", \"enabled\": " & acctEnabled & ", \"fullName\": \"" & acctFullName & "\", \"emails\": [" & emailsJson & "]}"
        end repeat
        return "[" & accountList & "]"
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
