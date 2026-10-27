import React from 'react';

export type IssueRef = {idReadable: string; summary: string};

/** Issue line styled like the relation dialog: bold ID, summary in the secondary color. */
const IssueLine: React.FC<{issue: IssueRef}> = ({issue}) => (
  <div className="parent-confirm__issue">
    <span className="relation-picker__issue-id">{issue.idReadable}</span>
    {issue.summary && <span className="parent-confirm__summary">{issue.summary}</span>}
  </div>
);

/** Body of the parent change confirmation: Change parent of "<child>" to "<parent>". */
export const ParentChangeDescription: React.FC<{child: IssueRef; parent: IssueRef}> = ({child, parent}) => (
  <div className="parent-confirm">
    <strong className="relation-picker__verb">Change parent of</strong>
    <IssueLine issue={child}/>
    <strong className="relation-picker__verb">to</strong>
    <IssueLine issue={parent}/>
  </div>
);
