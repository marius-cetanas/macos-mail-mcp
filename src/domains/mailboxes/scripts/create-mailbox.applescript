tell application "Mail"
    try
        set theAccount to account "{{accountName}}"
        set theParent to "{{parentMailboxName}}"

        if theParent is "__NONE__" then
            set newMbox to make new mailbox with properties {name:"{{mailboxName}}"} at theAccount
        else
            set parentMbox to my resolveMailbox("{{accountName}}", theParent)
            set newMbox to make new mailbox with properties {name:"{{mailboxName}}"} at parentMbox
        end if

        set mboxName to my escapeForJson(name of newMbox)
        set acctName to my escapeForJson(name of theAccount)
        return "{\"success\": true, \"mailboxName\": \"" & mboxName & "\", \"accountName\": \"" & acctName & "\"}"
    on error errMsg number errNum
        return "{\"error\": \"" & my escapeForJson(errMsg) & "\", \"errorNumber\": " & errNum & "}"
    end try
end tell
