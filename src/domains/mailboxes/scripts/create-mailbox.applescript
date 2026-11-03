tell application "Mail"
    try
        set theAccount to account "{{accountName}}"
        set theParent to "{{parentMailboxName}}"
        set requestedPath to my mailboxCreationPath("", "{{mailboxName}}")

        if theParent is not "__NONE__" then
            set parentMbox to my resolveMailbox("{{accountName}}", theParent)
            set requestedPath to my mailboxCreationPath(my mailboxFullName(parentMbox), "{{mailboxName}}")
        end if

        set newMbox to make new mailbox with properties {name:requestedPath} at theAccount
        set actualPath to my mailboxFullName(newMbox)
        my assertCreatedMailboxPath(requestedPath, actualPath)
        set mboxName to my escapeForJson(actualPath)
        set acctName to my escapeForJson(name of theAccount)
        return "{\"success\": true, \"mailboxName\": \"" & mboxName & "\", \"accountName\": \"" & acctName & "\"}"
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
