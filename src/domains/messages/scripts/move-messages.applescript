tell application "Mail"
    try
        set targetIds to my parseMoveMessageIds("{{messageIds}}")
        set srcMailbox to my resolveMailbox("{{accountName}}", "{{mailboxName}}")
        set destMailbox to my resolveMailbox("{{accountName}}", "{{toMailbox}}")

        set movedCount to 0
        set failedCount to 0
        set errorList to ""

        repeat with targetId in targetIds
            try
                set msg to (first message of srcMailbox whose id is targetId)
                move msg to destMailbox
                set movedCount to movedCount + 1
            on error errMsg
                set failedCount to failedCount + 1
                if errorList is not "" then set errorList to errorList & ", "
                set errorList to errorList & "{\"id\": " & my integerForJson(targetId) & ", \"error\": \"" & my escapeForJson(errMsg) & "\"}"
            end try
        end repeat

        return "{\"moved\": " & my integerForJson(movedCount) & ", \"failed\": " & my integerForJson(failedCount) & ", \"errors\": [" & errorList & "]}"
    on error errMsg number errNum
        return "{\"error\": \"" & my escapeForJson(errMsg) & "\", \"errorNumber\": " & my integerForJson(errNum) & "}"
    end try
end tell

on parseMoveMessageIds(idString)
    set oldDelimiters to AppleScript's text item delimiters
    try
        if (length of idString) is 0 then error "Invalid move ID list."
        set AppleScript's text item delimiters to ","
        set idItems to every text item of idString
        set targetIds to {}
        repeat with idItem in idItems
            set tokenText to idItem as text
            set digitStart to 1
            if tokenText starts with "-" then set digitStart to 2
            if (length of tokenText) < digitStart then error "Invalid move ID list."
            repeat with i from digitStart to length of tokenText
                set pointValue to id of character i of tokenText
                if class of pointValue is not integer then error "Invalid move ID list."
                if pointValue < 48 or pointValue > 57 then error "Invalid move ID list."
            end repeat
            set targetId to tokenText as number
            my integerForJson(targetId)
            set end of targetIds to targetId
        end repeat
        set AppleScript's text item delimiters to oldDelimiters
        return targetIds
    on error errMsg number errNum
        set AppleScript's text item delimiters to oldDelimiters
        error errMsg number errNum
    end try
end parseMoveMessageIds
