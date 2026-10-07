# Generated on 2026-10-07: optional informational quantity/unit/unit_price on Income.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('incomes', '0005_income_is_archived'),
    ]

    operations = [
        migrations.AddField(
            model_name='income',
            name='quantity',
            field=models.DecimalField(blank=True, decimal_places=2, help_text='Optional quantity (informational).', max_digits=12, null=True),
        ),
        migrations.AddField(
            model_name='income',
            name='unit',
            field=models.CharField(blank=True, choices=[('kg', 'Kg'), ('tn', 'Tn'), ('l', 'L')], help_text='Optional quantity unit (informational).', max_length=2, null=True),
        ),
        migrations.AddField(
            model_name='income',
            name='unit_price',
            field=models.DecimalField(blank=True, decimal_places=2, help_text='Optional price per unit (informational).', max_digits=12, null=True),
        ),
    ]
