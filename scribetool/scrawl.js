/**
 * Scrawl is a tool that is useful for taking minutes via IRC and cleaning them
 * up for public consumption. It takes an IRC log as input and generates a
 * nice, stand-alone HTML page from the input.
 */
(function (doc) {
  window.scrawl = window.scrawl || {};
  var scrawl = window.scrawl;

  /* The update counter and the timeout is used to delay the update of the
    HTML output by a few seconds so that reformatting the page doesn't
    overload the CPU. */
  scrawl.updateCounter = 1;
  scrawl.updateCounterTimeout = null;

  /* Standard regular expressions to use when matching lines */
  var commentRx = /^\[(.*)\]\s+<(.*)>\s+(.*)$/;
  var scribeRx = /^(scribe|scribenick):.*$/i;
  var chairRx = /^chair:.*$/i;
  var proposalRx = /^(proposal|proposed):\s+?(.*)$/i;
  var resolutionRx = /^(resolution|resolved):\s+?(.*)$/i;
  var topicRx = /^topic:\s*(.*)$/i;
  var actionRx = /^action:\s*(.*)$/i;
  var voipRx = /^zakim$/i;
  var toVoipRx = /^zakim,.*$/i;
  var queueRx = /^q[+-]\s+.*|^q[+-].*|^[+-]q|^ack\s+.*|^ack$/i;
  var presentRx = /^present\+\s+(.*)$/i;
  var voteRx = /^[+-][01]\s.*|[+-][01]$/i;
  var agendaRx = /^agenda:\s*(https?:.*)$/i;
  var urlRx = /((ftp|http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-\/]))?)/;

  scrawl.wordwrap = function (str, width, brk, cut) {
    brk = brk || '\n';
    width = width || 65;
    cut = cut || false;

    if (!str) { return str; }

    var regex = '.{1,' + width + '}(\\s|$)' +
      (cut ? '|.{' +width+ '}|.+$' : '|\\S+?(\\s|$)');

    return str.match(RegExp(regex, 'g')).join(brk);
  };

  scrawl.generateAliases = function () {
    var rval = {};

    for (p in scrawl.people) {
      var person = scrawl.people[p];
      var names = p.split(" ");

      // append any aliases to the list of known names
      if ("alias" in person) {
        names = names.concat(person["alias"]);
      }

      // Add the aliases and names if they don't already exist in the aliases
      for (n in names) {
        var alias = names[n];
        alias = alias.toLowerCase();
        if (alias.length > 2 && !(alias in rval)) {
          rval[alias] = p;
        }
      }
    }

    return rval;
  };

  scrawl.htmlencode = function (text) {
    var modified = document.createElement('div');
    modified.textContent = text;
    modified = modified.innerHTML.replace(urlRx, "<a href=\"$1\">$1</a>");

    return modified;
  };

  scrawl.topic = function (msg, id, textMode) {
    var rval = "";
    if (textMode == "html") {
      rval = `
              <h1 id="topic-${id}" class="topic">Topic: ${scrawl.htmlencode(msg)}</h1>\n`;
    } else {
      rval = "\nTopic: " + msg + "\n\n";
    }

    return rval;
  };

  scrawl.action = function (msg, id, textMode) {
    var rval = "";
    if (textMode == "html") {
      rval = "<div id=\"action-" + id + "\" class=\"action\"><strong>ACTION</strong>: " +
       scrawl.htmlencode(msg) + "</div>\n";
    } else {
      rval = "\nACTION: " + msg + "\n\n";
    }

    return rval;
  };

  scrawl.information = function (msg, textMode) {
    var rval = "";
    if (textMode == "html") {
      rval = "<div class=\"information\">" +
       scrawl.htmlencode(msg) + "</div>\n";
    } else {
      rval = scrawl.wordwrap(msg, 65, "\n  ") + "\n";
    }

    return rval;
  };

  scrawl.proposal = function (msg, textMode) {
    var rval = "";
    if (textMode == "html") {
      rval = "<div class=\"proposal\"><strong>PROPOSAL:</strong> " +
       scrawl.htmlencode(msg) + "</div>\n";
    } else {
      rval =
        "\n" + scrawl.wordwrap("PROPOSAL: " + msg, 65, "\n  ") + "\n\n";
    }

    return rval;
  };

  scrawl.resolution = function (msg, id, textMode) {
    var rval = "";
    if (textMode == "html") {
      rval = "<div id=\"resolution-" + id + "\" class=\"resolution\">" +
        "<strong>RESOLUTION:</strong> " +
        scrawl.htmlencode(msg) + "</div>\n";
    } else {
      rval =
        "\n" + scrawl.wordwrap("RESOLUTION: " + msg, 65, "\n  ") + "\n\n";
    }

    return rval;
  };

  scrawl.scribe = function (msg, textMode, person, assist) {
    var rval = "";
    if (textMode == "html") {
      rval = "<div ";

      if (person != undefined) {
        rval += "class=\"comment\"><span class=\"name\">" +
          scrawl.htmlencode(person) + "</span>: ";
      } else {
        rval += "class=\"information\">";
      }

      rval += scrawl.htmlencode(msg);

      if (assist != undefined) {
        rval += " [scribe assist by " + scrawl.htmlencode(assist) + "]";
      }

      rval += "</div>\n";
    } else {
      scribeline = "";
      if (person != undefined) {
        scribeline = person + ": ";
      }
      scribeline += msg;
      if (assist != undefined) {
        scribeline += " [scribe assist by "+ assist + "]";
      }

      rval = scrawl.wordwrap(scribeline, 65, "\n  ") + "\n";
    }

    return rval;
  };

  scrawl.scribeContinuation = function (msg, textMode) {
    var rval = "";
    if (textMode == "html") {
      rval = "<div class=\"comment-continuation\">" +
       scrawl.htmlencode(msg) + "</div>\n";
    } else {
      rval = scrawl.wordwrap("  " + msg, 65, "\n  ") + "\n";
    }

    return rval;
  }

  scrawl.present = function (context, person) {
    if (person != undefined) {
      context.present[person] = true;
    }
  };

  scrawl.error = function (msg, textMode) {
    var rval = "";
    if (textMode == "html") {
      rval = "<div class=\"error\">Error: " +
        scrawl.htmlencode(msg) + "</div>\n";
    } else {
      rval = scrawl.wordwrap("\nError: " + msg, 65, "\n  ") + "\n";
    }

    return rval;
  };

  scrawl.processLine = function (context, aliases, line, textMode) {
     var rval = "";
     var match = commentRx.exec(line);

     if (match) {
       var time = match[1];
       var nick = match[2].toLowerCase();
       var msg = match[3];

       // check for a scribe line
       if (msg.search(scribeRx) != -1) {
         var scribe = msg.split(":")[1].replace(" ", "");
         scribe = scribe.toLowerCase();

         if (scribe in aliases) {
           context.scribenick = scribe;
           context.scribe = aliases[scribe];
           scrawl.present(context, aliases[scribe]);
           rval = scrawl.information(
             context.scribe + " is scribing.", textMode);
         }
       } else if (msg.search(chairRx) != -1) {
         var chair = msg.split(":")[1].replace(" ", "").split(" ")[0];
         chair = chair.toLowerCase();

         if (chair in aliases) {
           context.chair = aliases[chair];
           scrawl.present(context, aliases[chair]);
         }
       // check for topic line
       } else if (msg.search(topicRx) != -1) {
         var topic = msg.match(topicRx)[1];
         context.topics = context.topics.concat(topic);
         rval = scrawl.topic(topic, context.topics.length, textMode);
       // check for action line
       } else if (msg.search(actionRx) != -1) {
         var action = msg.match(actionRx)[1];
         context.actions = context.actions.concat(action);
         rval = scrawl.action(action, context.actions.length, textMode);
       // check for Agenda line
       } else if (msg.search(agendaRx) != -1) {
         var agenda = msg.match(agendaRx)[1];
         context.agenda = agenda;
       // check for proposal line
       } else if (msg.search(proposalRx) != -1) {
         var proposal = msg.match(proposalRx)[2];
         rval = scrawl.proposal(proposal, textMode);
       // check for resolution line
       } else if (msg.search(resolutionRx) != -1) {
         var resolution = msg.match(resolutionRx)[2];
         context.resolutions = context.resolutions.concat(resolution);
         rval = scrawl.resolution(
           resolution, context.resolutions.length, textMode);
       // the line is from or is addressed to the voip bot, ignore it
       } else if (nick.search(voipRx) != -1 || msg.search(toVoipRx) != -1) {
       // the line is queue management, ignore it
       } else if (msg.search(queueRx) != -1) {
       // the line is a present+ message
       } else if (msg.search(presentRx) != -1) {
         var present = msg.match(presentRx)[1];
         if (present in aliases) {
           scrawl.present(context, aliases[present]);
         }
       // the line is a +1/-1 vote
       } else if (msg.search(voteRx) != -1) {
         if (nick in aliases) {
           scrawl.present(context, aliases[nick]);
           rval = scrawl.scribe(msg, textMode, aliases[nick]);
         }
       // the line is by the scribe
       } else if (nick == context.scribenick) {
          context.scribeAssist = null;
         if (msg.indexOf("…") == 0 || msg.indexOf("...") == 0) {
           // the line is a scribe continuation
           rval = scrawl.scribeContinuation(msg, textMode);
         } else if (msg.indexOf(":") != -1) {
           var alias = msg.split(":", 1)[0].replace(" ", "").toLowerCase();

           if (alias in aliases) {
             // the line is a comment made by somebody else that was
             // scribed
             var cleanedMessage = msg.split(":").splice(1).join(":");

             scrawl.present(context, aliases[alias]);
             rval = scrawl.scribe(cleanedMessage, textMode, aliases[alias]);
           } else {
             // The scribe is noting something and there just happens
             // to be a colon in it
             rval = scrawl.scribe(msg, textMode);
           }
         } else {
           // The scribe is noting something
           rval = scrawl.scribe(msg, textMode);
         }
       // the line is a comment by somebody else
       } else if (nick != context.scribenick) {
         if (msg.indexOf(":") != -1) {
           var alias = msg.split(":", 1)[0].replace(" ", "").toLowerCase();

           if (alias in aliases) {
             // the line is a scribe assist
             var cleanedMessage = msg.split(":").splice(1).join(":");
             context.scribeAssist = nick;

             scrawl.present(context, aliases[alias]);
             rval = scrawl.scribe(cleanedMessage, textMode, aliases[alias], aliases[nick]);
           } else if (alias.indexOf("http") == 0) {
             rval = scrawl.scribe(msg, textMode, aliases[nick]);
           } else if (aliases.hasOwnProperty(nick)) {
             rval = scrawl.scribe(msg, textMode, aliases[nick]);
           } else {
             rval = scrawl.error(
               "(IRC nickname not recognized)" + line, textMode);
           }
         } else if (nick == context.scribeAssist &&
             (msg.indexOf("…") == 0 || msg.indexOf("...") == 0)) {
             // the line is a scribe continuation
             rval = scrawl.scribeContinuation(msg, textMode);
         } else {
           // the line is a scribe line by somebody else
           context.scribeAssist = null;
           scrawl.present(context, aliases[nick]);
           rval = scrawl.scribe(msg, textMode, aliases[nick]);
         }
       } else {
         rval = scrawl.error("(Strange line format)" + line, textMode);
       }
     }

     return rval;
  };

  scrawl.generateSummary = function (context, textMode) {
    var rval = "";
    var date = context.date;
    var group = context.group;
    var agenda = context.agenda;
    var audio = "audio.mp3";
    var chair = context.chair;
    var scribe = context.scribe;
    var topics = context.topics;
    var resolutions = context.resolutions;
    var actions = context.actions;
    var present = Object.keys(context.present);

    // generate the summary text
    if (textMode == "html") {
      rval += `
              <h1>${group} Telecon</h1>
              <h2>Minutes for ${date}</h2>
              <div class="summary">
                  <dl>
                      <dt>Agenda</dt>
                      <dd><a href="${agenda}">${agenda}</a></dd>
                      `;

      if (topics.length > 0) {
        rval += `<dt>Topics</dt>
                      <dd><ol>\n`;
        for (i in topics) {
          var topicNumber = parseInt(i) + 1;
          rval += "                         ";
          rval += `<li><a href="#topic-${topicNumber}">${topics[i]}</a>\n`;
        }
        rval += `                      </ol></dd>
                      `;
      }

      if (resolutions.length > 0) {
        rval += `<dt>Resolutions</dt>
                      <dd><ol>\n`;
        for (i in resolutions) {
          var resolutionNumber = parseInt(i) + 1;
          rval += "                         ";
          rval += `<li><a href="#resolution-${resolutionNumber}">${resolutions[i]}</a>\n`;
        }
        rval += `                      </ol></dd>
                      `;
      }

      if (actions.length > 0) {
        rval += `<dt>Action Items</dt>
                      <dd><ol>\n`;
        for (i in actions) {
          var actionNumber = parseInt(i) + 1;
          rval += "                         ";
          rval += `<li><a href="#action-${actionNumber}">${actions[i]}</a>\n`;
        }
        rval += `                      </ol></dd>
                      `;
      }

      rval += `<dt>Chair</dt>
                      <dd>${chair}</dd>
                      <dt>Scribe</dt>
                      <dd>${scribe}</dd>
                      <dt>Present</dt>
                      <dd>${present.join(", ")}</dd>
                      <dt>Audio Log</dt>
                      <dd>
                        <audio controls="controls" preload="none">
                            <source src="${audio}" type="audio/mpeg" />
                            Warning: Your browser does not support the HTML5 audio element,
                            please upgrade.<br>
                            <a href="${audio}">${audio}</a>
                        </audio>
                      </dd>
                  </dl>
              </div>\n`;
    } else {
      rval += group + " Telecon ";
      rval += "Minutes for " + date + "\n\n";
      rval += "Agenda:\n  " + agenda + "\n";

      if (topics.length > 0) {
        rval += "Topics:\n";
        for (i in topics) {
          var topicNumber = parseInt(i) + 1;
          rval += scrawl.wordwrap(
            "  " + topicNumber + ". " + topics[i], 65,
            "\n    ") + "\n";
        }
      }

      if (resolutions.length > 0) {
        rval += "Resolutions:\n";
        for (i in resolutions) {
          var resolutionNumber = parseInt(i) + 1;
          rval += scrawl.wordwrap(
            "  " + resolutionNumber + ". " + resolutions[i], 65,
            "\n    ") + "\n";
        }
      }

      if (actions.length > 0) {
        rval += "Action Items:\n";
        for (i in actions) {
          var actionNumber = parseInt(i) + 1;
          rval += scrawl.wordwrap(
            "  " + actionNumber + ". " + actions[i], 65,
            "\n    ") + "\n";
        }
      }

      rval += "Chair:\n  " + chair + "\n";
      rval += "Scribe:\n  " + scribe + "\n";
      rval += "Present:\n  " +
        scrawl.wordwrap(present.join(", "), 65, "\n  ") + "\n";
      rval += "Audio:\n  http://www.hydra-cg.org/minutes/" + date + "/audio.mp3\n\n";
      rval += "\n";
    }

    return rval;
  };

  scrawl.displayMinutes = function () {
    minutes = scrawl.generateMinutes("html");

    doc.getElementById("html-output").innerHTML = minutes;
  };

  scrawl.generateMinutes = function (textMode, mailHeader) {
    var rval = "";
    var minutes = "";
    var summary = "";
    var ircLines = doc.getElementById("irc-log").value.split("\n");
    var aliases = scrawl.generateAliases();

    // initialize the IRC log scanning context
    var context = {
      "group": scrawl.group,
      "date": scrawl.date,
      "chair": "Markus Lanthaler",
      "present": {},
      "topics": [],
      "resolutions": [],
      "actions": []
    };

    // process each IRC log line
    for (var i = 0; i < ircLines.length; i++) {
      var line = scrawl.processLine(context, aliases, ircLines[i], textMode);

      if (textMode == "html" && line !== "") {
        minutes += "              ";
      }
      minutes += line
    }

    if (textMode == "text" && mailHeader) {
      summary += `Thanks ${context.scribe.replace(/\s.*/, '')} for scribing. The minutes from this week's telecon are
now available at

   http://www.hydra-cg.com/minutes/${context.date}/

The full text of the discussion is below, including a link to the audio
recording.


-------------------------------------------------------------------
`;
    }

    // generate the meeting summary
    summary += scrawl.generateSummary(context, textMode);

    // create the final log output
    rval = summary + minutes;

    return rval;
  }

  scrawl.updateMinutes = function (event) {
    if (event) {
      scrawl.updateCounter = 1;
    } else {
      scrawl.updateCounter--;
    }

    if (scrawl.updateCounter <= 0) {
      scrawl.displayMinutes();
    } else {
      if (scrawl.updateCounterTimeout) {
        clearTimeout(scrawl.updateCounterTimeout);
      }
      scrawl.updateCounterTimeout =
        setTimeout(scrawl.updateMinutes, 1000);
    }
  };

  scrawl.hide = function (id) {
   doc.getElementById(id).style.display = 'none';
  };

  scrawl.show = function (id) {
   doc.getElementById(id).style.display = '';
  };

  scrawl.showMarkup = function (type, mailHeader)
  {
    // Display the appropriate markup text area based on the 'type'
    if (type == "html") {
      var html = scrawl.htmlHeader
        + scrawl.generateMinutes("html")
        + scrawl.htmlFooter;

      scrawl.hide("irc-log");
      scrawl.hide("text-markup");

      doc.getElementById("html-markup").value = html;
      scrawl.show("html-markup");
    } else if (type == "text") {
      var text = scrawl.generateMinutes(type, mailHeader)

      scrawl.hide("html-markup");
      scrawl.hide("irc-log");

      doc.getElementById("text-markup").value = text;
      scrawl.show("text-markup");
    } else {
      scrawl.hide("text-markup");
      scrawl.hide("html-markup");
      scrawl.show("irc-log");
    }
  }
})(document);
