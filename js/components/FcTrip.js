import { attachRoutes, dispatch, fragment, goTo, html } from '../lib.js'
import AddExpenseForm from './AddExpenseForm.js'

import {
  onInitTrip as onInitTripBalance,
  onNewExpense as onNewExpenseBalance,
  onSettleUpClick
} from '../handlers/balance.js'

import {
  onInitTrip as onInitTripExpenses,
  onNewExpense as listOnNewExpense,
  onFirstExpense,
  onImmediateNewExpense,
  onUnsyncedNewExpense,
} from '../handlers/expenses.js'

export default class FcTrip extends HTMLElement {
  connectedCallback () {
    attachRoutes([
      ['click -> menu h2', onTabSwitch],
      ['click -> #refresh_button', onRefreshButtonClicked],
      ['touchstart -> h1,[path="/trip"]', checkPull],
      ['app:did_init_trip', onInitTrip],
      ['app:did_add_expense', onNewExpense],
      ['app:just_did_add_expense', withIdTarget('expense_list', onImmediateNewExpense)],
      ['app:unsynced_add_expense', withIdTarget('expense_list', onUnsyncedNewExpense)],
      ['app:did_unauthorized', onUnauthorized],
      ['app:did_empty', onEmpty],
      ['synced', onSynced],
      ['settle_up', onSettleUpClick],
      ['navigate -> [path="add_expense"]', onAddExpenseFormOpen],
      ['jsonsubmit -> [name="add_expense"]', onAddExpenseFormSubmit],
      ['jsonsubmit -> [name="password_input"]', onPasswordSubmit],
      ['pulldown', ({ target }) => dispatch(target, 'sync')],
    ], this)

    dispatch(this, 'local:fetch')
    dispatch(this, 'sync')
  }
}

function onTabSwitch ({ target }) {
  const menu = target.closest('menu')
  const activeItem = menu.querySelector('[to].active')

  if (target === activeItem) {
    return
  }

  if (activeItem) {
    activeItem.classList.remove('active')
  }

  target.classList.add('active')
}

function onRefreshButtonClicked (event) {
  event.preventDefault()
  dispatch(event.target, 'sync')
}

function onInitTrip ({ currentTarget, detail }) {
  currentTarget.append(fragment`
    <menu>
      <h2 to="expenses" class="active">Expenses</h2>
      <h2 to="balance">Balance</h2>
    </menu>
    <section path="expenses">
      <div class="spinner"></div>
      <ul id="expense_list" class="expense-list">
        <li class="placeholder">
          <p>You haven't spent anything yet, well done!</p>
          <p>When someone buys something, just click on "Add an expense" below to record it.</p>
        </li>
      </ul>
      <footer>
        <a href="./" title="Home page" class="nav">❮ Home</a>
        <button to="add_expense" title="Add an expense">Add an expense</button>
        <a href="#" title="Refresh the expenses" role="button" class="nav" id="refresh_button">↻ Refresh</a>
      </footer>
    </section>
    <section path="balance">
      <dl id="balance_list" class="balance-list"></dl>
      <div class="debt-list">
        <h4>How to balance?</h4>
        <ul></ul>
      </div>
    </section>
    <section path="add_expense">${AddExpenseForm(detail.members)}</section>`
  )

  document.querySelector('h1').innerText = detail.name

  const expenseList = document.getElementById('expense_list')

  onInitTripExpenses(expenseList, detail)
  onInitTripBalance(document.getElementById('balance_list'), detail)
  currentTarget.addEventListener(
    'app:did_add_expense',
    () => onFirstExpense(expenseList),
    { once: true }
  )

  goTo('expenses')
}

function onNewExpense ({ detail }) {
  listOnNewExpense(document.getElementById('expense_list'), detail)
  onNewExpenseBalance(document.getElementById('balance_list'), detail)
}

function onUnauthorized ({ target }) {
  const input = html`<password-input-form path="password_input" name="password_input"></password-input-form>`
  target.append(input)
  target.addEventListener('app:did_init_trip', () => input.remove(), {once: true})
  goTo('password_input')
}

function onEmpty ({ target }) {
  target.append(html`
    <hgroup class="full-width">
      <h2>There is nothing here</h2>
      <h3>If you had a Freecount at that address, it might have been cleaned after 30 days of inactivity</h3>
    </hgroup>
  `)
}

function onPasswordSubmit({currentTarget, detail }) {
  dispatch(currentTarget, 'sync', { key: detail })
  dispatch(currentTarget, 'local:storetrip', trip => Object.assign({}, trip, { key: detail }))
}

function onAddExpenseFormOpen ({ target }) {
  const titleInput = target.querySelector('form [name="title"]')
  const dateInput = target.querySelector('form [name="date"]')

  if (!titleInput.value) {
    titleInput.focus()
  }

  if (!dateInput.value) {
    dateInput.value = (new Date()).toISOString().substr(0, 10)
  }
}

function onAddExpenseFormSubmit ({ target, detail }) {
  dispatch(target, 'app:postcommand', { command: 'add_expense', data: detail })
  target.addEventListener('http_request_stop', () => {
    dispatch(target, 'sync')
    goTo('expenses')
  }, { once: true })
}

function onSynced({currentTarget}) {
  for (let li of currentTarget.querySelectorAll('.expense-item.unsynced')) {
    dispatch(currentTarget, 'app:postcommand', {
      command: 'add_expense',
      data: li.expense
    })
  }
}

function withIdTarget (id, handler) {
  return event => handler(document.getElementById(id), event.detail)
}

/**
 * Binds temporary listener on touch events to re-trigger
 * higher-level pull events
 */
export function checkPull ({ target, targetTouches, timeStamp }) {
  if (!targetTouches.length) {
    return
  }

  const startTouch = targetTouches[0]

  target.addEventListener('touchend', (event) => {
    if (event.changedTouches.length) {
      const endTouch = event.changedTouches[0]
      const duration = event.timeStamp - timeStamp

      if (duration > 2000 || duration < 100) {
        return
      }

      const [diffX, diffY] = [
        endTouch.clientX - startTouch.clientX,
        endTouch.clientY - startTouch.clientY
      ]

      if (Math.abs(diffX) < 80 && diffY > 100) {
        dispatch(event.target, 'pulldown')
      }
    }
  }, { once: true })
}
