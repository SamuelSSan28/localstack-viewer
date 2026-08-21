import { renderDynamo } from './js/views/dynamodb.js';
import { renderEmails } from './js/views/emails.js';
import { renderOverview } from './js/views/overview.js';
import { renderSqs } from './js/views/sqs.js';
import { renderSns } from './js/views/sns.js';
import { renderS3 } from './js/views/s3.js';
import { initializeSelects } from './js/ui.js';

const views = {
  overview: renderOverview,
  s3: renderS3,
  dynamodb: renderDynamo,
  sqs: renderSqs,
  sns: renderSns,
  emails: renderEmails,
};
const container = document.querySelector('#view');
initializeSelects();

function navigate(view) {
  const selected = views[view] ? view : 'overview';
  document
    .querySelectorAll('[data-view]')
    .forEach((item) => item.classList.toggle('active', item.dataset.view === selected));
  history.replaceState({}, '', selected === 'overview' ? '/' : `#${selected}`);
  views[selected](container);
}

document
  .querySelectorAll('[data-view]')
  .forEach((item) => (item.onclick = () => navigate(item.dataset.view)));
window.addEventListener('hashchange', () => navigate(location.hash.slice(1)));
navigate(location.hash.slice(1));
