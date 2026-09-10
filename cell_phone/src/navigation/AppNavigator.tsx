import React from 'react';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { OverviewScreen } from '../screens/OverviewScreen';
import { AnalyticsScreen } from '../screens/AnalyticsScreen';
import { FarmsScreen } from '../screens/FarmsScreen';
import { TreesScreen } from '../screens/TreesScreen';
import { TasksScreen } from '../screens/TasksScreen';
import { ExpensesScreen, IncomesScreen } from '../screens/TransactionsScreens';
import { ContactsScreen, LookupsScreen } from '../screens/ContactsLookupsScreens';
import { SettingsScreen } from '../screens/SettingsScreen';

const Drawer = createDrawerNavigator();

export function AppNavigator() {
  return (
    <Drawer.Navigator initialRouteName="Overview" screenOptions={{ headerTintColor: '#244b3b' }}>
      <Drawer.Screen name="Overview" component={OverviewScreen} />
      <Drawer.Screen name="Farms" component={FarmsScreen} />
      <Drawer.Screen name="Trees" component={TreesScreen} />
      <Drawer.Screen name="Tasks" component={TasksScreen} />
      <Drawer.Screen name="Expenses" component={ExpensesScreen} />
      <Drawer.Screen name="Incomes" component={IncomesScreen} />
      <Drawer.Screen name="Vendors" component={ContactsScreen} initialParams={{ kind: 'vendors' }} />
      <Drawer.Screen name="Customers" component={ContactsScreen} initialParams={{ kind: 'customers' }} />
      <Drawer.Screen name="ExpenseCategories" component={LookupsScreen} initialParams={{ table: 'expense_categories' }} options={{ title: 'Expense categories' }} />
      <Drawer.Screen name="IncomeCategories" component={LookupsScreen} initialParams={{ table: 'income_categories' }} options={{ title: 'Income categories' }} />
      <Drawer.Screen name="TreeTypes" component={LookupsScreen} initialParams={{ table: 'tree_types' }} options={{ title: 'Tree types' }} />
      <Drawer.Screen name="TaskCategories" component={LookupsScreen} initialParams={{ table: 'task_categories' }} options={{ title: 'Task categories' }} />
      <Drawer.Screen name="Analytics" component={AnalyticsScreen} />
      <Drawer.Screen name="Settings" component={SettingsScreen} />
    </Drawer.Navigator>
  );
}
