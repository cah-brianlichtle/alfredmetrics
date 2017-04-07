var restClient = require('node-rest-client').Client;
var login = require('./login');
var _ = require('underscore');
var fs = require('file-system');
var async = require('async');

var Cardinal = Cardinal || {};
Cardinal.Alfred = Cardinal.Alfred || {};

Cardinal.Alfred.Metrics = function () {
  var client = new restClient({user: login.username, password: login.password});
  var allTheIssues = [];
  var seperator = "";

  client.registerMethod('getNumberOfIssues', 'https://cardinalhealth.atlassian.net/rest/api/2/search?jql=project=ALF%20AND%20resolution%20=%20Done%20AND%20statusCategory%20=%20Done%20AND%20type%20!=%20Spike%20AND%20type%20!=%20Chore&maxResults=0', 'GET');
  client.registerMethod('getAllIssues', 'https://cardinalhealth.atlassian.net/rest/api/2/search?jql=project=ALF%20AND%20resolution%20=%20Done%20AND%20statusCategory%20=%20Done%20AND%20type%20!=%20Spike%20AND%20type%20!=%20Chore&maxResults=${maxResults}&startAt=${startAt}', 'GET');
  client.registerMethod('getIssueInfo', 'https://cardinalhealth.atlassian.net/rest/api/latest/issue/${issueId}?expand=changelog', 'GET');

  function getAllIssues() {
    client.methods.getNumberOfIssues(function (data) {
      var args = {
        path: {
          maxResults: data.total,
          startAt: 0
        }
      };

      getMaxIssues(args);
    });
  }

  function getMaxIssues(args, issues) {
    console.log('Retrieving issues...')
    issues = issues || [];
    client.methods.getAllIssues(args, function (data) {
      issues = _.union(issues, data.issues);

      if (issues.length < args.path.maxResults) {
        args.path.startAt = data.issues.length;
        getMaxIssues(args, issues);
      } else {
        console.log("All issues have been retrieved...");
        var issueKeys = _.pluck(_.sortBy(issues, 'key'), 'key');
        getIssueInfo(issueKeys);
      }
    });
  }

  function getIssueInfo(issueKeys) {
    console.log('Creating output file...');
    fs.writeFileSync('DisplayNamesByCardNumber.json', '[\n');

    console.log('Number of issues: ' + issueKeys.length);
    console.log('Retrieving history on each issue...');


    var issueQueue = async.queue(getIssueInfoByKey, 25);
    issueQueue.drain = issueQueueDrain;
    issueQueue.push(issueKeys);
  }

  function getIssueInfoByKey(issueKey, callback) {
    var args = {
      path: {"issueId": issueKey}
    };

    client.methods.getIssueInfo(args, function (data) {
      var history = {};
      if (data && data.changelog && data.changelog.histories) {
        history = data.changelog.histories;
      }

      var issueInfo = {};
      issueInfo.key = data.key;
      issueInfo.summary = data.fields.summary;
      issueInfo.cardAuthor = getDisplayNames(history);
      issueInfo.assignee = getDeveloperElement(history, "assignee");
      var pair = getDeveloperElement(history, "Developer Pair");

        if (pair == null && data.fields != null && data.fields.customfield_11404 != null) {
            pair = data.fields.customfield_11404.displayName;
        }

        if (pair == null || pair == '') {
            pair = 'NONE';
        }


      issueInfo.developerPair = pair;
      issueInfo.completedDate = getDate(data.fields.resolutiondate);
      issueInfo.storyPoints = getStoryPoints(history);
      issueInfo.sprint = getSprintElement(history);
      issueInfo.type = data.fields.issuetype.name;

      fs.appendFileSync('DisplayNamesByCardNumber.json', seperator + JSON.stringify(issueInfo));

      if (!seperator) {
        seperator = ",\n";
      }

      // TODO: Add all the issues to one array for later use
      allTheIssues.push(data);
      console.log('Issue ' + issueInfo.key + ' has been processed');
      callback();
    });
  }

  function getDate(inDate) {
    var date = new Date(inDate);
    var month = date.getUTCMonth() + 1;
    var day = date.getUTCDate();
    var year = date.getUTCFullYear();
    return day + "/" + month + "/" + year;
  }

  function getDeveloperElement(history, fieldName) {
        var developerElements = [];
        _.each(history, function(record){
            var developerStructure = _.where(record.items, {field: fieldName});
            if (developerStructure.length > 0) {
                var item = developerStructure[0];
                if (item != null) {
                    var originalValue = item.fromString;
                    var newValue = item.toString;

                    if (originalValue == null && newValue != null && newValue.trim().length > 0) {
                        developerElements.push(newValue);
                    } else if (originalValue != null && originalValue.length > 0 && originalValue != "Derrick Pena" && originalValue != "Lauren Tzonkov") {
                        developerElements.push(originalValue);
                    }
                }
            }
        });
        return _.first(developerElements);
    }

    function getSprintElement(history) {
        var sprints = [];
        _.each(history, function(record){
            var structure = _.where(record.items, {field: "Sprint"});
            if (structure.length > 0) {
                var item = structure[0];
                if (item != null) {
                    sprints.push(item.toString);
                }
            }
        });

        var sprint = _.last(sprints);
        if (sprint) {
            sprint = sprint.replace("Muppets ", "");
        }

        return sprint;
    }

    function getStoryPoints(history) {
        var storyPoints = [];
        _.each(history, function(record){
            var structure = _.where(record.items, {field: "Story Points"});
            if (structure.length > 0) {
                var item = structure[0];
                if (item != null) {
                    storyPoints.push(item.toString);
                }
            }
        });
        return _.last(storyPoints);
    }

  function getDisplayNames(history) {
    var displayNames = [];

    _.each(history, function (record) {
      displayNames.push(record.author.displayName);
    });

    displayNames = _.uniq(displayNames);
    return _.first(displayNames);
  }

  function issueQueueDrain() {
    console.log('All issues have been processed...');
    fs.appendFileSync('DisplayNamesByCardNumber.json', ']');
  }

  return {
    getAllIssues: getAllIssues
  }
};

Cardinal.Alfred.Metrics().getAllIssues();
