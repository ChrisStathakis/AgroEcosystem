from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('profiles', '0002_profile_dropbox'),
    ]

    operations = [
        migrations.AddField(
            model_name='profile',
            name='dropbox_app_key',
            field=models.CharField(blank=True, default='', help_text='Dropbox app key entered in Settings.', max_length=255),
        ),
        migrations.AddField(
            model_name='profile',
            name='dropbox_app_secret',
            field=models.CharField(blank=True, default='', help_text='Dropbox app secret entered in Settings.', max_length=255),
        ),
    ]
