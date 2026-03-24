tell application "Mail"
    try
        set newMsg to make new outgoing message with properties {content:"{{body}}", subject:"{{subject}}", visible:false}
        tell newMsg
            make new to recipient with properties {address:"{{to}}"}
            if "{{cc}}" is not "__NONE__" then
                make new cc recipient with properties {address:"{{cc}}"}
            end if
            if "{{bcc}}" is not "__NONE__" then
                make new bcc recipient with properties {address:"{{bcc}}"}
            end if
            if "{{attachmentPaths}}" is not "__NONE__" then
                set AppleScript's text item delimiters to ","
                set pathList to every text item of "{{attachmentPaths}}"
                set AppleScript's text item delimiters to ""
                repeat with attachPath in pathList
                    set trimmedPath to attachPath
                    make new attachment with properties {file name:POSIX file trimmedPath} at after last paragraph
                    delay 1
                end repeat
            end if
            send
        end tell
        return "{\"success\": true}"
    on error errMsg number errNum
        return "{\"error\": \"" & errMsg & "\", \"errorNumber\": " & errNum & "}"
    end try
end tell
