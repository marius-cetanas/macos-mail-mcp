tell application "Mail"
    try
        set theAccount to account "{{accountName}}"
        set srcMailbox to mailbox "{{mailboxName}}" of theAccount
        set destMailbox to mailbox "{{toMailbox}}" of theAccount

        set idString to "{{messageIds}}"
        set AppleScript's text item delimiters to ","
        set idItems to every text item of idString
        set AppleScript's text item delimiters to ""

        set movedCount to 0
        set failedCount to 0
        set errorList to ""

        repeat with idItem in idItems
            set targetId to (idItem as text) as integer
            try
                set msg to (first message of srcMailbox whose id is targetId)
                move msg to destMailbox
                set movedCount to movedCount + 1
            on error errMsg
                set failedCount to failedCount + 1
                if errorList is not "" then set errorList to errorList & ", "
                set errorList to errorList & "{\"id\": " & targetId & ", \"error\": \"" & my escapeForJson(errMsg) & "\"}"
            end try
        end repeat

        return "{\"moved\": " & movedCount & ", \"failed\": " & failedCount & ", \"errors\": [" & errorList & "]}"
    on error errMsg number errNum
        return "{\"error\": \"" & my escapeForJson(errMsg) & "\", \"errorNumber\": " & errNum & "}"
    end try
end tell
