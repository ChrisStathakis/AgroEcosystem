import React from 'react';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { OverviewScreen } from '../screens/OverviewScreen';
import { AnalyticsScreen } from '../screens/AnalyticsScreen';
import { FarmsScreen } from '../screens/FarmsScreen';
import { ProductionsScreen } from '../screens/ProductionsScreen';
import { TreesScreen } from '../screens/TreesScreen';
import { TasksScreen } from '../screens/TasksScreen';
import { ExpensesScreen, IncomesScreen } from '../screens/TransactionsScreens';
import { ContactsScreen, LookupsScreen } from '../screens/ContactsLookupsScreens';
import { SettingsScreen } from '../screens/SettingsScreen';
import { DrawerContent } from './DrawerContent';
import { useColors } from '../components/theme';
import { t, useLang } from '../lib/i18n';

const Drawer = createDrawerNavigator();

const TITLES: Record<string, string> = {
  Overview: 'overview',
  Farms: 'farms',
  Production: 'productions',
  Trees: 'trees',
  Tasks: 'tasks',
  Expenses: 'expenses',
  Incomes: 'incomes',
  Vendors: 'vendors',
  Customers: 'customers',
  ExpenseCategories: 'expense_categories',
  IncomeCategories: 'income_categories',
  TreeTypes: 'tree_types',
  TaskCategories: 'task_categories',
  Analytics: 'analytics',
  Settings: 'settings',
};

export function AppNavigator() {
  const theme = useColors();
  useLang();
  return (
    <Drawer.Navigator
      initialRouteName="Overview"
      drawerContent={(props) => <DrawerContent {...props} />}
      screenOptions={({ route }) => ({
        title: t(TITLES[route.name] ?? route.name),
        headerTintColor: theme.green,
        headerStyle: { backgroundColor: theme.bg },
        headerTitleStyle: { fontWeight: '800', fontSize: 16, color: theme.ink },
        headerShadowVisible: false,
        drawerType: 'slide',
        drawerStyle: { width: 300, backgroundColor: theme.card, borderTopRightRadius: 24, borderBottomRightRadius: 24 },
        sceneStyle: { backgroundColor: theme.bg },
      })}
    >
      <Drawer.Screen name="Overview" component={OverviewScreen} />
      <Drawer.Screen name="Farms" component={FarmsScreen} />
      <Drawer.Screen name="Production" component={ProductionsScreen} />
      <Drawer.Screen name="Trees" component={TreesScreen} />
      <Drawer.Screen name="Tasks" component={TasksScreen} />
      <Drawer.Screen name="Expenses" component={ExpensesScreen} />
      <Drawer.Screen name="Incomes" component={IncomesScreen} />
      <Drawer.Screen name="Vendors" component={ContactsScreen} initialParams={{ kind: 'vendors' }} />
      <Drawer.Screen name="Customers" component={ContactsScreen} initialParams={{ kind: 'customers' }} />
      <Drawer.Screen name="ExpenseCategories" component={LookupsScreen} initialParams={{ table: 'expense_categories' }} />
      <Drawer.Screen name="IncomeCategories" component={LookupsScreen} initialParams={{ table: 'income_categories' }} />
      <Drawer.Screen name="TreeTypes" component={LookupsScreen} initialParams={{ table: 'tree_types' }} />
      <Drawer.Screen name="TaskCategories" component={LookupsScreen} initialParams={{ table: 'task_categories' }} />
      <Drawer.Screen name="Analytics" component={AnalyticsScreen} />
      <Drawer.Screen name="Settings" component={SettingsScreen} />
    </Drawer.Navigator>
  );
}
