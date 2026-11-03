tell application "Mail"
    try
        set theAccount to account "{{accountName}}"
        set theParent to "{{parentMailboxName}}"
        set requestedPath to my mailboxCreationPath("", "{{mailboxName}}")

        if theParent is not "__NONE__" then
            set parentMbox to my resolveMailbox("{{accountName}}", theParent)
            set requestedPath to my mailboxCreationPath(my mailboxFullName(parentMbox), "{{mailboxName}}")
        end if

        set alreadyExisted to (exists mailbox requestedPath of theAccount)
        if alreadyExisted then
            set newMbox to mailbox requestedPath of theAccount
            set statusJson to "\"created\": false, \"alreadyExisted\": true"
        else
            set newMbox to make new mailbox with properties {name:requestedPath} at theAccount
            set statusJson to "\"created\": true, \"alreadyExisted\": false"
        end if
        set actualPath to my mailboxFullName(newMbox)
        my assertCreatedMailboxPath(requestedPath, actualPath)
        set mboxName to my escapeForJson(actualPath)
        set acctName to my escapeForJson(name of theAccount)
        return "{\"success\": true, " & statusJson & ", \"mailboxName\": \"" & mboxName & "\", \"accountName\": \"" & acctName & "\"}"
    on error errMsg number errNum
        return "{\"error\": \"" & my escapeForJson(errMsg) & "\", \"errorNumber\": " & my integerForJson(errNum) & "}"
    end try
end tell

on mailboxCreationPath(parentPath, childName)
    if (length of parentPath) is 0 then return childName
    return parentPath & "/" & childName
end mailboxCreationPath

on assertCreatedMailboxPath(requestedPath, actualPath)
    if (id of requestedPath) is not (id of actualPath) then
        error "Mail returned a different mailbox path than requested."
    end if
end assertCreatedMailboxPath
